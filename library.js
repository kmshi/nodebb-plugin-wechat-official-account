/**
 * Created by kshi on 10/13/15.
 */

"use strict";

var plugin = {},
	winston = module.parent.require('winston'),
	meta = module.parent.require('./meta'),
	user = module.parent.require('./user'),
	db = module.parent.require('./database'),
    querystring = module.require("querystring"),
    rest = module.require('restler'),
	passport = module.parent.require('passport'),
	passportWechat = require('passport-wechat').Strategy,
	nconf = module.parent.require('nconf');

var constantsWeb = Object.freeze({
	'name': 'wechatweb',
	'admin': {
		'route': '/plugins/sso-wechatweb',
		'icon': 'fa-weixin'
	}
});

var constantsApp = Object.freeze({
	'name': 'wechatapp',
	'admin': {
		'route': '/plugins/sso-wechatapp',
		'icon': 'fa-weixin'
	}
});

function redirect_weixin_oauth(req,res,onlyOpenId){
	var scope = (onlyOpenId==true?"snsapi_base":"snsapi_userinfo");
	var state = (onlyOpenId==true?"0":"1");
	var path = "https://open.weixin.qq.com/connect/oauth2/authorize?";
	var str = querystring.stringify({appid:nconf.get("wechat:appid"),
		redirect_uri:nconf.get("wechat:secure_domain")+req.originalUrl.split("?")[0],
		response_type:"code",
		scope:scope});

	str = str + "&state=" + state;

	winston.info("redirect:"+path+str+"#wechat_redirect");
	res.redirect(path+str+"#wechat_redirect");
	//for website, use "https://open.weixin.qq.com/connect/qrconnect?" and "snsapi_login" scope.
}

function setCookieMaxAge(req){
	var duration = 1000*60*60*24*parseInt(meta.config.loginDays || 14, 10);
	req.session.cookie.maxAge = duration;
	req.session.cookie.expires = new Date(Date.now() + duration);
}

function wechatAuth(req, res, next) {
	if (req.headers['user-agent'].indexOf('MicroMessenger')===-1 || req.isAuthenticated()) return next();
	if (!req.query || !req.query.code) return redirect_weixin_oauth(req,res,true);

	var path = "https://api.weixin.qq.com/sns/oauth2/access_token?";
	var str = querystring.stringify({appid:nconf.get("wechat:appid"),secret:nconf.get("wechat:appsecret"),code:req.query.code,grant_type:"authorization_code"});

	rest.json(path+str,{}).on("success",function(authData) {
		authData = JSON.parse(authData);
		if (authData.errcode) {
			return next(authData);
		}
		var unionid = authData.unionid || authData.openid;
		if (req.query.state==="0"){
			db.getObjectField('unionid:uid', unionid, function(err, uid) {
				if (err) return next(err);
				if (uid){
					setCookieMaxAge(req);
					req.login({uid: uid}, next);
				}else{
					redirect_weixin_oauth(req,res,false);
				}
			});
		}else{
			path = "https://api.weixin.qq.com/sns/userinfo?";
			str = querystring.stringify({access_token:authData.access_token,openid:authData.openid,lang:"zh_CN"});
			rest.json(path+str,{}).on("success",function(userInfo) {
				userInfo = JSON.parse(userInfo);
				if (userInfo.errcode) {
					return next(userInfo);
				}
				var unionid = userInfo.unionid || userInfo.openid;
				user.create({username:userInfo.nickname.replace(/[^'"\s\-.*0-9\u00BF-\u1FFF\u2C00-\uD7FF\w]/g,'')},function(err, uid){
					if (err) return next(err);
					var data = {
						country:userInfo.country,
						province:userInfo.province,
						fullname:userInfo.nickname,
						city:userInfo.city,
						openid:userInfo.openid,
						unionid:userInfo.unionid,
						sex:userInfo.sex,
						uploadedpicture: userInfo.headimgurl,
						picture: userInfo.headimgurl
					};
					db.setObjectField('unionid:uid', unionid, uid);
					user.setUserFields(uid,data,function(){
						setCookieMaxAge(req);
						req.login({uid: uid}, function(){
							res.redirect(nconf.get("wechat:secure_domain")+req.originalUrl.split("?")[0]);
						});
					});
				});
			}).on("error",function(err){
				next(err);
			});
		}
	}).on("error",function(err){
		next(err);
	});
}

function login(userInfo,isWeb,callback){
	var unionid = userInfo.unionid || userInfo.openid;
	db.getObjectField('unionid:uid', unionid, function(err, uid) {
		if (err) return next(err);
		if (uid){
			if (isWeb){
				callback(null,{uid: uid});
			}else{
				user.setUserFields(uid,{openid:userInfo.openid},function(){
					callback(null,{uid: uid});
				});
			}

		}else{
			user.create({username:userInfo.nickname.replace(/[^'"\s\-.*0-9\u00BF-\u1FFF\u2C00-\uD7FF\w]/g,'')},function(err, uid){
				if (err) return next(err);
				var data = {
					country:userInfo.country,
					province:userInfo.province,
					fullname:userInfo.nickname,
					city:userInfo.city,
					unionid:unionid,
					sex:userInfo.sex,
					uploadedpicture: userInfo.headimgurl,
					picture: userInfo.headimgurl
				};
				if (!isWeb){data.openid = userInfo.openid;}
				db.setObjectField('unionid:uid', unionid, uid);
				user.setUserFields(uid,data,function(){
					callback(null,{uid: uid});
				});
			});
		}
	});
}


function paymentResultNotify(req, res, next) {

}

function alarmNotify(req, res, next) {

}

plugin.load = function(params, callback) {
	var router = params.router,
		middleware = params.middleware;

	router.post('/notify/paymentResultNotify',paymentResultNotify);
	router.post('/notify/alarmNotify',alarmNotify);

	//router.use('/',wechatAuth);
	callback();
};

plugin.userDelete = function(uid,callback){
	callback = callback || function() {};
	db.getObject('openid:uid',function(err,obj){
		if (err) return callback(err);
		for (var openid in obj){
			if (obj[openid]===uid) return db.deleteObjectField('openid:uid', openid, callback);
		}
		callback();
	});
};

plugin.getStrategy = function(strategies, callback){
	passport.use(
		"wechatapp",
		new passportWechat({
			appID: nconf.get("wechat:appid"),
			appSecret:nconf.get("wechat:appsecret"),
			client:'wechat',
			callbackURL: nconf.get('url') + '/auth/wechatapp/callback',
			scope: "snsapi_userinfo",
			state:1
		},
		function(accessToken, refreshToken, profile, done) {
			login(profile,false,done);
		})
	);
	strategies.push({
		name: 'wechatapp',
		url: '/auth/wechatapp',
		callbackURL: '/auth/wechatapp/callback',
		icon: constantsApp.admin.icon
	});

	passport.use(
		"wechatweb",
		new passportWechat({
				appID: plugin.settings.app_id,
				appSecret: plugin.settings.secret,
				client:'web',
				callbackURL: nconf.get('url') + '/auth/wechatweb/callback',
				scope: "snsapi_login",
				state:1
			},
			function(accessToken, refreshToken, profile, done) {
				login(profile,true,done);
			})
	);
	strategies.push({
		name: 'wechatweb',
		url: '/auth/wechatweb',
		callbackURL: '/auth/wechatweb/callback',
		icon: constantsApp.admin.icon
	});
	callback(null, strategies);
};

plugin.getAssociation = function(data, callback){
	user.getUserField(data.uid, 'unionid', function(err, unionid) {
		if (err) {
			return callback(err, data);
		}

		if (unionid) {
			data.associations.push({
				associated: true,
				url: nconf.get('url'),//TODO
				name: constantsWeb.name,
				icon: constantsWeb.admin.icon
			});
		} else {
			data.associations.push({
				associated: false,
				url: nconf.get('url') + '/auth/wechatweb',
				name: constantsWeb.name,
				icon: constantsWeb.admin.icon
			});
		}

		callback(null, data);
	})
};

plugin.addMenuItem = function(custom_header, callback) {
	custom_header.authentication.push({
		'route': constantsWeb.admin.route,
		'icon': constantsWeb.admin.icon,
		'name': constantsWeb.name
	});
	custom_header.authentication.push({
		'route': constantsApp.admin.route,
		'icon': constantsApp.admin.icon,
		'name': constantsApp.name
	});

	callback(null, custom_header);
};

module.exports = plugin;

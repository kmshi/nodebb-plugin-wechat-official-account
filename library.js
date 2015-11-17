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
	API = require('wechat-api'),
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


var wechatapi = new API(nconf.get("wechat:appid"),nconf.get("wechat:appsecret"));

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
	if (req.headers['user-agent'].indexOf('MicroMessenger')===-1 || req.isAuthenticated() || req.session.wechatVerified) return next();
	if (!req.query || !req.query.code) return redirect_weixin_oauth(req,res,true);

	var path = "https://api.weixin.qq.com/sns/oauth2/access_token?";
	var str = querystring.stringify({appid:nconf.get("wechat:appid"),secret:nconf.get("wechat:appsecret"),code:req.query.code,grant_type:"authorization_code"});

	rest.json(path+str,{}).on("success",function(authData) {
		authData = JSON.parse(authData);
		if (authData.errcode) {
			//ignore the error
			req.session.wechatVerified = 1;
			return next();
		}
		db.getObjectField('openid:uid', authData.openid, function(err, uid) {
			if (err) {
				//ignore the error
				req.session.wechatVerified = 1;
				return next();
			}
			if (uid){
				//setCookieMaxAge(req);
				req.login({uid: uid}, next);
			}else{
				req.session.wechatVerified = 1;
				next();
			}
		});
	}).on("error",function(err){
		//ignore the error
		req.session.wechatVerified = 1;
		next();
	});
}

function login(userInfo,isWeb,callback){
	var data = {
		country:userInfo.country,
		province:userInfo.province,
		fullname:userInfo.nickname,
		city:userInfo.city,
		//unionid:userInfo.unionid,
		sex:userInfo.sex,
		uploadedpicture: userInfo.headimgurl,
		picture: userInfo.headimgurl
	};
	if (userInfo.webopenid){
		data.webopenid = userInfo.webopenid;
	}else{
		data.openid = userInfo.openid;
	}

	db.getObjectField('openid:uid', userInfo.webopenid||userInfo.openid, function(err, uid) {
		if (err) return callback(err);
		if (uid){
			if(userInfo.unionid) db.setObjectField('unionid:uid', userInfo.unionid, uid);
			callback(null,{uid: uid});
		}else{
			if(userInfo.unionid){
				db.getObjectField('unionid:uid', userInfo.unionid, function(err, uid) {
					if (err) return callback(err);
					if (uid){
						db.setObjectField('openid:uid', userInfo.webopenid||userInfo.openid, uid);
						callback(null,{uid: uid});
					}else{
						user.create({username:userInfo.nickname.replace(/[^'"\s\-.*0-9\u00BF-\u1FFF\u2C00-\uD7FF\w]/g,'')},function(err, uid){
							if (err) return callback(err);
							data.unionid = userInfo.unionid;
							db.setObjectField('unionid:uid', userInfo.unionid, uid);
							db.setObjectField('openid:uid', userInfo.webopenid||userInfo.openid, uid);
							user.setUserFields(uid,data,function(){
								callback(null,{uid: uid});
							});
						});
					}
				});
			}else{
				user.create({username:userInfo.nickname.replace(/[^'"\s\-.*0-9\u00BF-\u1FFF\u2C00-\uD7FF\w]/g,'')},function(err, uid){
					if (err) return callback(err);
					//data.unionid = userInfo.unionid;
					//db.setObjectField('unionid:uid', userInfo.unionid, uid);
					db.setObjectField('openid:uid', userInfo.webopenid||userInfo.openid, uid);
					user.setUserFields(uid,data,function(){
						callback(null,{uid: uid});
					});
				});
			}

		}
	});
}


function paymentResultNotify(req, res, next) {

}

function alarmNotify(req, res, next) {

}

function wechatJSConfig(req,res){
	var url = req.query.url;
	if (url){
		wechatapi.getLatestToken(function(err,result){
			if(err){
				return res.status(500).json(err);
			}
			wechatapi.getJsConfig({url: url},function(err,data){
				if(err){
					return res.status(500).json(err);
				}
				data.url = url;
				res.json(data);
			});
		});
	}else{
		res.status(400).json({ error: 'No url parameter' });
	}
}

plugin.load = function(params, callback) {
	var router = params.router,
		middleware = params.middleware;

	router.post('/notify/paymentResultNotify',paymentResultNotify);
	router.post('/notify/alarmNotify',alarmNotify);
	router.get('/api/wechatJSConfig',wechatJSConfig);

	router.use('/',wechatAuth);
	callback();
};

plugin.userDelete = function(uid,callback){
	callback = callback || function() {};
	db.getObject('openid:uid',function(err,obj){
		if (err) return callback(err);
		for (var openid in obj){
			if (obj[openid]===uid) db.deleteObjectField('openid:uid', openid);
		}
		db.getObject('unionid:uid',function(err,obj){
			if (err) return callback(err);
			for (var unionid in obj){
				if (obj[unionid]===uid) db.deleteObjectField('unionid:uid', unionid);
			}
			callback();
		});
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
				appID: nconf.get("wechatweb:appid"),
				appSecret: nconf.get("wechatweb:appsecret"),
				client:'web',
				callbackURL: nconf.get('url') + '/auth/wechatweb/callback',
				scope: "snsapi_login",
				state:1
			},
			function(accessToken, refreshToken, profile, done) {
				profile.webopenid = profile.openid;
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
	user.getUserField(data.uid, 'webopenid', function(err, webopenid) {
		if (err) {
			return callback(err, data);
		}

		if (webopenid) {
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
	//custom_header.authentication.push({
	//	'route': constantsWeb.admin.route,
	//	'icon': constantsWeb.admin.icon,
	//	'name': constantsWeb.name
	//});
	//custom_header.authentication.push({
	//	'route': constantsApp.admin.route,
	//	'icon': constantsApp.admin.icon,
	//	'name': constantsApp.name
	//});

	callback(null, custom_header);
};

module.exports = plugin;

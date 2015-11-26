/**
 * Created by kshi on 10/13/15.
 * TODO List:
 * 1.file upload plugin to leancloud/qiniu cloud
 * 2.New Topic UI, wechat version and web version
 * 3.Fast Post, wxsession and list wait/nowait, ask user to click a link: /wxBind?openid=xxx
 * 4.Notification
 * 5.JS SDK Social Share
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
	wechat = require('wechat'),
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
	'name': 'wechat',
	'admin': {
		'route': '/plugins/sso-wechat',
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
	if (req.headers['user-agent'].toLowerCase().indexOf('micromessenger')===-1 || req.isAuthenticated() || req.session.wechatVerified) return next();
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
	//TODO:headimgurl need be saved to leancloud/qiniu
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

var List = wechat.List;

List.add('bind', [
	['快速发帖需绑定微信,请先'],
	['回复{1}直接使用微信登录并绑定', function (info, req, res, next) {
		res.nowait('xxx,登录并绑定成功,请输入title');
	}],
	['回复{2}使用其他已有帐号登录并在profile里绑定微信', function (info, req, res, next) {
		res.nowait('我是个妹纸哟');
	}]
]);

List.add('category', [
	['请选择要发布的板块'],
	['回复{1}发布到Blog', function (info, req, res, next) {
		//TODO:create new topic
		delete req.wxsession.fastPost;
		res.nowait('发布到Blog');
	}],
	['回复{x}取消发布', function (info, req, res, next) {
		delete req.wxsession.fastPost;
		res.nowait('本次发布取消');
	}]
]);

function wechatInputHandler(req, res, next){
	// 微信输入信息都在req.weixin上
	var message = req.weixin;
	if (message.Event==="CLICK" && message.EventKey==="FAST_POST"){
		req.wxsession.fastPost = {content:[]};
		//check binding by message.FromUserName
		if(!req.wxsession.fastPost._bind){
			res.wait('bind');
		}else{
			res.reply('请输入title');
		}
	}
	if (message.MsgType==="text"){
		if (req.wxsession.fastPost){
			if(!req.wxsession.fastPost._bind)res.wait('bind');
			if (message.Content==="#"){
				res.wait('category');
			}
			if (req.wxsession.fastPost.title){
				req.wxsession.fastPost.content.push(message.Content);
			}else{
				req.wxsession.fastPost.title = message.Content;
			}
			res.reply('可继续添加图片,视频与文字,以#结束');
		}
	}
	if (message.MsgType==="image"||message.MsgType==="video"||message.MsgType==="shortvideo"){
		if (req.wxsession.fastPost){
			if(!req.wxsession.fastPost._bind)res.wait('bind');
			req.wxsession.fastPost.content.push(message.MediaId);
			res.reply('可继续添加图片,视频与文字,以#结束');
		}
	}
	//res.transfer2CustomerService(kfAccount);

	//TODO: use req.wxsession to complete fast-post process,medias should be downloaded and uploaded to cloud
	//user send a event to invoke fast-post, first check if it is binded,
	//reply a message with link to a login page if it is not binded
	//else reply a message to ask user enter title
	//then reply a message to ask user enter image,video,text, and end with #
	//finally replay a list message for user to select a category or cancel
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

function wxBind(req,res){
	var openid = req.query.openid;
	if(openid) req.session._openid = openid;
	res.redirect(nconf.get('relative_path')+"/login");
}

plugin.userLoggedIn = function(params){
	var uid = params.uid;
	var openid = params.req.session._openid;
	if (openid){
		console.info("openid:"+openid);
		wechatapi.getLatestToken(function(err,result){
			if(err) return;
			wechatapi.getUser(openid,function(err,userInfo){
				console.dir(userInfo);
				if(err)return;
				var data = {
					country:userInfo.country,
					province:userInfo.province,
					fullname:userInfo.nickname,
					city:userInfo.city,
					openid:userInfo.openid,
					sex:userInfo.sex,
					uploadedpicture: userInfo.headimgurl,
					picture: userInfo.headimgurl
				};
				if(userInfo.unionid) {
					data.unionid = userInfo.unionid;
					db.setObjectField('unionid:uid', userInfo.unionid, uid);
				}
				db.setObjectField('openid:uid', userInfo.openid, uid);
				user.setUserFields(uid,data,function(){
					//send out socket event so UI can alert and exit
				});
			});
		});
	}
	delete params.req.session._openid;
}

plugin.load = function(params, callback) {
	var router = params.router,
		middleware = params.middleware;

	if (!nconf.get("wechat")){
		winston.info(
			'\n===========================================================\n'+
			'Please, add parameters for wechat in config.json\n'+
			'"wechat": {' + '\n' +
			'    "appid": "",' + '\n' +
			'    "appsecret": "",' + '\n' +
			'    "allowAuth": true,' + '\n' +
			'    "token": ""' + '\n' +
			'    "encodingAESKey": ""' + '\n' +
			'    "payment_mch_id": ""' + '\n' +
			'    "payment_api_key": ""' + '\n' +
			'    "payment_notify_url": ""' + '\n' +
			'    "secure_domain": ""' + '\n' +
			'}\n'+
			' and/or (wechat sso for web site):\n' +
			'"wechatweb": {' + '\n' +
			'    "appid": "",' + '\n' +
			'    "appsecret": "",' + '\n' +
			'}\n'+
			'==========================================================='
		);
		winston.error("Unable to initialize wechat-official-account!");
		return callback();
	}

	router.post('/notify/paymentResultNotify',paymentResultNotify);
	router.post('/notify/alarmNotify',alarmNotify);
	router.get('/api/wechatJSConfig',wechatJSConfig);
	router.get('/wxBind',wxBind);

	var config = nconf.get("wechat:token");
	if (nconf.get("wechat:encodingAESKey")!==null && nconf.get("wechat:encodingAESKey")!==""){
		config = {
			token:nconf.get("wechat:token"),
			appid:nconf.get("wechat:appid"),
			encodingAESKey:nconf.get("wechat:encodingAESKey")
		};
	}
	router.use('wechat',wechat(config,wechatInputHandler));

	if(nconf.get("wechat:allowAuth")){
		router.use('/',wechatAuth);
	}
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
	if(nconf.get("wechat:allowAuth")){
		passport.use(
			"wechat",
			new passportWechat({
					appID: nconf.get("wechat:appid"),
					appSecret:nconf.get("wechat:appsecret"),
					client:'wechat',
					callbackURL: nconf.get('url') + '/auth/wechat/callback',
					scope: "snsapi_userinfo",
					state:1
				},
				function(accessToken, refreshToken, profile, done) {
					login(profile,false,done);
				})
		);
		strategies.push({
			name: 'wechat',
			url: '/auth/wechat',
			callbackURL: '/auth/wechat/callback',
			icon: constantsApp.admin.icon
		});
	}

	if(nconf.get("wechatweb")){
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
	}

	callback(null, strategies);
};

plugin.getAssociation = function(data, callback){
	user.getUserFields(data.uid, ['webopenid','openid'], function(err, user) {
		if (err) {
			return callback(err, data);
		}

		if (user.webopenid) {
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

		if (user.openid) {
			data.associations.push({
				associated: true,
				url: nconf.get('url'),//TODO
				name: constantsApp.name,
				icon: constantsApp.admin.icon
			});
		} else {
			data.associations.push({
				associated: false,
				url: nconf.get('url') + '/auth/wechat',
				name: constantsApp.name,
				icon: constantsApp.admin.icon
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

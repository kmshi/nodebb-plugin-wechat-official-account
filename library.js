/**
 * Created by kshi on 10/13/15.
 * TODO List:
 * 1.file upload plugin to leancloud/qiniu cloud
 * 2.New Topic UI, wechat version and web version; wechat fast login button + other login button
 * 3.Fast Post, wxsession and list wait/nowait, ask user to click a link: /wxBind?openid=xxx --Doing
 * 4.Notification
 * 5.JS SDK Social Share
 */

"use strict";

var plugin = {},
	winston = module.parent.require('winston'),
	meta = module.parent.require('./meta'),
	user = module.parent.require('./user'),
	categories = module.parent.require('./categories'),
	topics = module.parent.require('./topics'),
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
	if ((req.headers['user-agent']||'').toLowerCase().indexOf('micromessenger')===-1 || req.isAuthenticated()|| req.session._openid || req.session._wechatAuthed) return next();
	if (!req.query || !req.query.code) return redirect_weixin_oauth(req,res,true);

	var path = "https://api.weixin.qq.com/sns/oauth2/access_token?";
	var str = querystring.stringify({appid:nconf.get("wechat:appid"),secret:nconf.get("wechat:appsecret"),code:req.query.code,grant_type:"authorization_code"});
	req.session._wechatAuthed = 1;

	rest.json(path+str,{}).on("success",function(authData) {
		authData = JSON.parse(authData);
		if (authData.errcode) {
			//ignore the error
			return next();
		}
		req.session._openid = authData.openid;
		db.getObjectField('openid:uid', authData.openid, function(err, uid) {
			if (err) {
				return next();
			}
			if (uid){
				//setCookieMaxAge(req);
				req.login({uid: uid}, next);
			}else{
				next();
			}
		});
	}).on("error",function(err){
		//ignore the error
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
	['回复{1}直接使用微信登录并绑定微信', function (req, res, next) {
		wechatapi.getLatestToken(function(err,result){
			if(err) return res.nowait(err);
			wechatapi.getUser(req.weixin.FromUserName,function(err,userInfo){
				if(err)return res.nowait(err);
				login(userInfo,false,function(){
					res.nowait(userInfo.nickname+',绑定成功,请输入标题');
				});
			});
		});
	}],
	['回复{2}使用其他已有帐号登录并绑定微信', function (req, res, next) {
		res.nowait("<a href='"+nconf.get('url')+"/wxBind?openid="+req.weixin.FromUserName+"'>请点击打开登录页面</a>");
	}]
]);

function publishTopic(req, res, next) {
	var openid = req.weixin.FromUserName;
	var cid = req.weixin.Content;
	//thumb,tags
	topics.post({
		uid:req.wxsession.user.uid,
		cid:cid,
		title:req.wxsession.fastPost.title,
		content:JSON.stringify(req.wxsession.fastPost.content)
	},function(err,data){
		delete req.wxsession.fastPost;
		List.remove('category_'+openid);
		if (err) return res.nowait('发布失败:'+err);
		//console.dir(data);
		res.nowait([
			{
				title: '成功发布到'+data.topicData.category.name,
				description: data.topicData.title,
				//picurl: 'http://nodeapi.cloudfoundry.com/qrcode.jpg',
				url: nconf.get("url")+"/topic/"+data.topicData.slug
			}
		]);
	});

}

function cancelPublish(req, res, next) {
	var openid = req.weixin.FromUserName;
	delete req.wxsession.fastPost;
	res.nowait('本次发布取消');
	List.remove('category_'+openid);
}

function showCategoryListForUser(openid,uid,callback){
	categories.getCategoriesByPrivilege(uid, 'find', function(err,categories){
		var items = [['请选择要发布的板块']];
		for(var idx in categories){
			items.push(['回复 {'+categories[idx].cid+'} 发布到'+categories[idx].name, publishTopic]);
		}
		items.push(['回复 {x} 取消发布', cancelPublish]);
		List.add('category_'+openid,items);
		callback();
	});
}



function wechatInputHandler(req, res, next){
	// 微信输入信息都在req.weixin上
	var message = req.weixin;
	var openid = req.weixin.FromUserName;
	console.dir(message);
	//console.dir(List.get('category_'+openid));

	db.getObjectField('openid:uid',openid, function(err, uid) {
		if (err) return res.reply(err);
		if (uid){
			req.wxsession.user = {uid:uid};
			if (message.MsgType==="text" && req.wxsession.fastPost){
				if (req.wxsession._wait) return res.reply('请回复合适的选项');
				if (message.Content.endsWith("#") && req.wxsession.fastPost.title){
					if(message.Content.length>1) {
						message.Content = message.Content.substr(0,message.Content.length-1)
						req.wxsession.fastPost.content.push(message);
					}
					return showCategoryListForUser(openid,uid,function(){
						res.wait('category_'+openid);
					});
				}
				if (req.wxsession.fastPost.title){
					req.wxsession.fastPost.content.push(message);
					return res.reply('可继续添加文字,图片,小视频,声音与位置,以#结束内容输入');
				}else{
					req.wxsession.fastPost.title = message.Content;
					return res.reply('请输入内容,如文字,图片,小视频,声音与位置,以#结束内容输入');
				}
			}else if ((message.MsgType!=="text" && message.MsgType!=="event") && req.wxsession.fastPost){
				if (req.wxsession._wait) return res.reply('请回复合适的选项');
				if (req.wxsession.fastPost.title) {
					req.wxsession.fastPost.content.push(message);
					return res.reply('可继续添加文字,图片,小视频,声音与位置,以#结束内容输入');
				}else{
					return res.reply('请输入标题');
				}
			}else if (message.MsgType==="event" && message.Event==="CLICK" && message.EventKey==="FAST_POST"){
				req.wxsession.fastPost = {content:[]};
				delete req.wxsession._wait;
				return res.reply('请输入标题');
			}else if (message.MsgType==="event" && message.Event==="LOCATION"){
				user.setUserFields(uid,{Latitude:message.Latitude,Longitude:message.Longitude},function(){
					res.reply();
				});
			}else{
				return res.reply();
				//return res.transfer2CustomerService(kfAccount);
			}
		} else{
			if (message.Event==="CLICK" && message.EventKey==="FAST_POST"){
				req.wxsession.fastPost = {content:[]};
				return res.wait('bind');
			}else{
				delete req.wxsession.fastPost;
				return res.reply();
				//return res.transfer2CustomerService(kfAccount);
			}
		}
	});
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

function bindUser2Wechat(uid,openid,callback){
	wechatapi.getLatestToken(function(err,result){
		if(err) return callback(err);
		wechatapi.getUser(openid,function(err,userInfo){
			if(err)return callback(err);
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
			user.setUserFields(uid,data,callback);
		});
	});
}

plugin.userLoggedIn = function(params){
	var uid = params.uid;
	var openid = params.req.session._openid;
	var req = params.req;
	if (openid){
		user.getUserField(uid, "openid", function(err, xopenid) {
			//if (err || xopenid) return;//if user is already assocaited
			bindUser2Wechat(uid,openid,function(err){
				//if (!err && !req.session._wechatAuthed){
					//send out socket event so UI can alert and exit
					//send out wechat message
					wechatapi.getLatestToken(function(err,result){
						wechatapi.sendText(openid,"绑定成功,请输入标题",function(err,result){
						});
					});
				//}
			});
		});
	}
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
	router.use('/wechat',wechat(config,wechatInputHandler));

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

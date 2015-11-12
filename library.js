/**
 * Created by kshi on 10/13/15.
 */

"use strict";

var plugin = {},
	winston = module.parent.require('winston'),
	meta = module.parent.require('./meta'),
	user = module.parent.require('./user'),
	db = module.parent.require('./database'),
	wechatConfig = module.require('./wechatConfig'),
    querystring = module.require("querystring"),
    rest = module.require('restler'),
	nconf = module.parent.require('nconf');

function redirect_weixin_oauth(req,res,onlyOpenId){
	var scope = (onlyOpenId==true?"snsapi_base":"snsapi_userinfo");
	var state = (onlyOpenId==true?"0":"1");
	var path = "https://open.weixin.qq.com/connect/oauth2/authorize?";
	var index = req.originalUrl.indexOf("code=");
	index = index==-1?req.originalUrl.length:index;
	var str = querystring.stringify({appid:wechatConfig.wechat_appid,
		redirect_uri:wechatConfig.secure_domain+req.originalUrl.slice(0,index),
		response_type:"code",
		scope:scope});

	str = str + "&state=" + state;

	winston.info("redirect:"+path+str+"#wechat_redirect");
	res.redirect(path+str+"#wechat_redirect");
	//for website, use "https://open.weixin.qq.com/connect/qrconnect?" and "snsapi_login" scope.
	//authData use unionid to replace openid, and use openid_host,openid_player,openid_site to store openid data
	//so he can login as same user from different entries,like website, mobile app, gongzonghao and etc.
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
	var str = querystring.stringify({appid:wechatConfig.wechat_appid,secret:wechatConfig.wechat_appsecret,code:req.query.code,grant_type:"authorization_code"});

	rest.json(path+str,{}).on("success",function(authData) {
		authData = JSON.parse(authData);
		if (authData.errcode) {
			return next(authData);
		}
		if (req.query.state==="0"){
			db.getObjectField('openid:uid', authData.openid, function(err, uid) {
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
				user.create({username:userInfo.nickname.replace(/[^'"\s\-.*0-9\u00BF-\u1FFF\u2C00-\uD7FF\w]/g,'')},function(err, uid){
					if (err) return next(err);
					var data = {
						country:userInfo.country,
						province:userInfo.province,
						city:userInfo.city,
						openid:userInfo.openid,
						unionid:userInfo.unionid,
						sex:userInfo.sex,
						uploadedpicture: userInfo.headimgurl,
						picture: userInfo.headimgurl
					};
					user.setUserFields(uid,data);
					db.setObjectField('openid:uid', userInfo.openid, uid);
					setCookieMaxAge(req);
					req.login({uid: uid}, next);
				});
			}).on("error",function(err){
				next(err);
			});
		}
	}).on("error",function(err){
		next(err);
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

	router.use('/',wechatAuth);
/*	router.use(function(req,res,next){
		console.log(req.originalUrl);
		console.log("res.locals=");
		console.dir(res.locals);
		console.log("isAuthenticated="+req.isAuthenticated());
		console.log("login="+req.login);
		next();
	});
*/
	callback();
};

module.exports = plugin;

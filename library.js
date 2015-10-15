/**
 * Created by kshi on 10/13/15.
 */

"use strict";

var plugin = {},
	winston = module.parent.require('winston'),
	meta = module.parent.require('./meta'),
	user = module.parent.require('./user'),
	db = module.parent.require('./database'),
	wechatConfig = module.require('./wechatConfig.json'),
    querystring = module.require("querystring"),
    rest = module.require('restler'),
	nconf = module.parent.require('nconf');

function wechatAuth(req, res, next) {
	if (req.headers['user-agent'].indexOf('MicroMessenger')>-1){
		winston.info("it is wechat inside");
		if (!req.user){
			if (req.query.code){
				var path = "https://api.weixin.qq.com/sns/oauth2/access_token?";
				var str = querystring.stringify({appid:wechatConfig.wechat_appid,secret:wechatConfig.wechat_appsecret,code:req.query.code,grant_type:"authorization_code"});
				rest.json(path+str,{}).on("success",function(authData) {
					authData = JSON.parse(authData);
					if (authData.errcode) {
						return next(authData);
					}
					db.getObjectField('wechat_openid:uid', authData.openid, function(err, uid) {
						if (err) return next(err);
						if (uid){
							req.user = {uid:uid};
							setCookieMaxAge(req);
						}else{
							user.create({username:authData.openid},function(err, uid){
								if (err) return next(err);
								req.user = {uid:uid};
								db.setObjectField('wechat_openid:uid', authData.openid, uid);
								setCookieMaxAge(req);
							});
						}

					});
				}).on("error",function(err){
					next(err);
				});
			}else{
				redirect_weixin_oauth(req,res);
			}
		}
	}else{
		next();
	}
}

function setCookieMaxAge(req){
	var duration = 1000*60*60*24*parseInt(meta.config.loginDays || 14, 10);
	req.session.cookie.maxAge = duration;
	req.session.cookie.expires = new Date(Date.now() + duration);
}


function redirect_weixin_oauth(req,res){
	var scope = "snsapi_base";
	var path = "https://open.weixin.qq.com/connect/oauth2/authorize?";
	var index = req.originalUrl.indexOf("code=");
	index = index==-1?req.originalUrl.length:index;
	var str = querystring.stringify({appid:wechatConfig.wechat_appid,
		redirect_uri:wechatConfig.secure_domain+req.originalUrl.slice(0,index),
		response_type:"code",
		scope:scope});

	path = path+str+"#wechat_redirect";
	winston.log("redirect:"+path);
	res.redirect(path);
	//for website, use "https://open.weixin.qq.com/connect/qrconnect?" and "snsapi_login" scope.
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

	callback();
};

module.exports = plugin;

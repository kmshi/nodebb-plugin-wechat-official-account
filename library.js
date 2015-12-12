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
	async = module.parent.require('async'),
	S = module.parent.require('string'),
	user = module.parent.require('./user'),
	categories = module.parent.require('./categories'),
	topics = module.parent.require('./topics'),
	posts = module.parent.require('./posts'),
	translator = module.parent.require('../public/src/modules/translator'),
	db = module.parent.require('./database'),
    querystring = module.require("querystring"),
    rest = module.require('restler'),
	AV = require("./avcloud"),
	API = require('wechat-api'),
	wechat = require('wechat'),
	passport = module.parent.require('passport'),
	passportWechat = require('passport-wechat').Strategy,
	nconf = module.parent.require('nconf');

var avcloud = new AV(nconf.get("avcloud:appid"),nconf.get("avcloud:appkey"));
var wechatapi = new API(nconf.get("wechat:appid"),nconf.get("wechat:appsecret"));

var List = wechat.List;

List.add('bind', [
	['闪发秒回需先绑定微信,请'],
	['回复{1}直接使用微信登录并绑定微信', function (req, res, next) {
		loginByOpenid(req.weixin.FromUserName,function(err,user){
			if (err) return res.nowait(err);
			res.nowait("登录并绑定成功,可以闪发秒回了.");
		});
	}],
	['回复{2}使用其他已有帐号登录并绑定微信', function (req, res, next) {
		res.nowait("<a href='"+nconf.get('url')+"/wxBind?openid="+req.weixin.FromUserName+"'>请点击打开登录页面</a>");
	}]
]);

function login(userInfo,isWeb,callback){
	copyRemoteToCloud(userInfo.headimgurl,function(err,url){
		userInfo.headimgurl = url;
		_login(userInfo,isWeb,callback);
	});
}

function _login(userInfo,isWeb,callback){
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

//when wechat auth by snsapi_base
function loginByOpenid(openid,callback){
	wechatapi.getLatestToken(function(err,result){
		if(err) return callback(err);
		wechatapi.getUser(openid,function(err,userInfo){
			login(userInfo,false,callback);
		});
	});
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

function generateUniqueId(){
	var hexOctet = function() {
		return Math.floor((1+Math.random())*0x10000).toString(16).substring(1);
	};
	return "U" + hexOctet() + hexOctet() + hexOctet() + hexOctet();//let it start by a letter
}

function extractImage(message,callback){
	//![baidu](http://www.baidu.com/img/bdlogo.gif "百度Logo")
	//callback(null,'[![baidu](http://www.baidu.com/img/bdlogo.gif "百度Logo")](http://baidu.com)');
	uploadMediaToCloud(message.MediaId,function(err,url){
		callback(null,'![]('+url+')');
	});
}

function extractVideo(message,callback){
	//https://github.com/mani95lisa/nodebb-plugin-video
	//http://jplayer.org/
	//http://www.jwplayer.com/
	//[video id=() thumbnail=() url=()]
	async.parallel({
		video:async.apply(uploadMediaToCloud,message.MediaId),
		thumbImg:async.apply(uploadMediaToCloud,message.ThumbMediaId)
	},function(err,results){
		callback(null,'[video id=('+generateUniqueId()+') thumbnail=('+results.thumbImg+') url=('+results.video+')]');
	});
}

function extractVoice(message,callback){
	//[voice id=() text=() url=()]
	callback(null,'[voice id=('+generateUniqueId()+') text=('+message.Recognition+') ]');
	//How to convert/play amr format voice? comment them here
	//uploadMediaToCloud(message.MediaId,function(err,url){
	//callback(null,'[voice id=('+message.MediaId+') text=('+message.Recognition+') url=('+url+')]');
	//});
}

function extractLink(message,callback){
	callback(null,'[**'+message.Title+'**: '+message.Description+']('+message.Url+')');
}

function extractLocation(message,callback){
	//[location locx=() locy=() name=() scale=()]
	callback(null,'[location id=('+generateUniqueId()+') locx=('+message.Location_X+') locy=('+message.Location_Y+') name=('+message.Label+') scale=('+message["Scale"]+')]');
}

function messages2Content(messages,callback){
	async.map(messages,function(message, next){
		if (message.MsgType==='image') return extractImage(message,next);
		if (message.MsgType==='video'||message.MsgType==='shortvideo') return extractVideo(message,next);
		if (message.MsgType==='voice') return extractVoice(message,next);
		if (message.MsgType==='link') return extractLink(message,next);
		if (message.MsgType==='location') return extractLocation(message,next);
		if (message.MsgType==='text') return next(null,message.Content);
		next(null,"Unknown message!");
	}, function(err, results){
		callback(null,results.join('\n'));
	});
}

function topicsUniqueSortAdd(topics,tid,title){
	for(var idx in topics){
		if (topics[idx].tid===tid) topics.splice(idx,1);
	}
	topics.unshift({tid:tid,title:title});
}

function publishTopic(req, res, next) {
	var openid = req.weixin.FromUserName;
	var cid = req.weixin.Content;
	messages2Content(req.wxsession.fastPost.content,function(err,text){
		if (err){
			return res.nowait('发布失败:'+err);
		}
		//thumb,tags
		topics.post({
			uid:req.wxsession.user.uid,
			cid:cid,
			title:req.wxsession.fastPost.title,
			content:text
		},function(err,data){
			delete req.wxsession.fastPost;
			List.remove('category_'+openid);
			if (err){
				return res.nowait('发布失败:'+err);
			}
			req.wxsession.topics = req.wxsession.topics||[];
			topicsUniqueSortAdd(req.wxsession.topics,data.topicData.tid,data.topicData.title);

			res.nowait([
				{
					title: '成功发布到:'+data.topicData.category.name,
					description: data.topicData.title,
					//picurl: 'http://nodeapi.cloudfoundry.com/qrcode.jpg',
					url: nconf.get("url")+"/topic/"+data.topicData.slug
				}
			]);
		});
	});
}

function cancelPublish(req, res, next) {
	var openid = req.weixin.FromUserName;
	if (req.wxsession.fastPost.isNew){
		res.nowait('本次发布取消');
	}else{
		res.nowait('本次回复取消');
	}
	delete req.wxsession.fastPost;
	List.remove('category_'+openid);
	List.remove('topic_'+openid);
}

function chooseTopic(req, res, next) {
	var openid = req.weixin.FromUserName;
	req.wxsession.fastPost.tid = req.weixin.Content;
	res.nowait('请输入内容,如文字,图片,小视频,声音与位置,以#结束内容输入');
	List.remove('topic_'+openid);
}

function replyTopic(uid,req, res, next) {
	var openid = req.weixin.FromUserName;
	messages2Content(req.wxsession.fastPost.content,function(err,text){
		if (err){
			return res.reply('回复失败:'+err);
		}
		topics.reply({uid: uid, tid: req.wxsession.fastPost.tid, content: text}, function(err,data){
			delete req.wxsession.fastPost;
			if (err){
				return res.reply('回复失败:'+err);
			}
			res.reply([
				{
					title: '成功回复到:'+data.topic.title,
					description: S(data.content).stripTags().s,
					//picurl: 'http://nodeapi.cloudfoundry.com/qrcode.jpg',
					url: nconf.get("url")+"/topic/"+data.topic.slug
				}
			]);
		});
	});
}

function showCategoryListForUser(openid,uid,callback){
	categories.getCategoriesByPrivilege(uid, 'find', function(err,categories){
		var items = [['请选择要发布的板块']];
		for(var idx in categories){
			items.push(['输入{'+categories[idx].cid+'}发布到:'+categories[idx].name, publishTopic]);
		}
		items.push(['输入{0}取消发布', cancelPublish]);
		List.add('category_'+openid,items);
		callback();
	});
}

function showTopicListForUser(openid,topics,callback){
	var items = [[(topics.length==0?'还没有您关注的主题':'请选择要回复的主题')]];
	for(var idx in topics){
		items.push(['输入{'+topics[idx].tid+'}回复到:'+topics[idx].title, chooseTopic]);
	}
	items.push(['输入{0}取消回复', cancelPublish]);
	List.add('topic_'+openid,items);
	callback();
}

function _authCheck(req, res, next){
	var openid = req.weixin.FromUserName;
	if (req.wxsession.user && req.wxsession.user.uid) return next();
	db.getObjectField('openid:uid',openid, function(err, uid) {
		if (err) return res.reply(err);
		if (uid){
			req.wxsession.user = {uid:uid};
		}
		next();
	});
}

function wechatInputHandler(req, res, next){
	// 微信输入信息都在req.weixin上
	var message = req.weixin;
	console.dir(message);

	_authCheck(req, res, function(){
		if (req.wxsession.user){
			var uid = req.wxsession.user.uid;
			var openid = message.FromUserName;

			if (req.wxsession._wait && message.MsgType!=="event") return res.reply('请回复合适的选项');

			if (message.MsgType==="text" && req.wxsession.fastPost){
				if (message.Content.endsWith("#") && req.wxsession.fastPost.title){
					if(message.Content.length>1) {
						message.Content = message.Content.substr(0,message.Content.length-1)
						req.wxsession.fastPost.content.push(message);
					}
					if (req.wxsession.fastPost.isNew){
						return showCategoryListForUser(openid,uid,function(){
							res.wait('category_'+openid);
						});
					}else{
						return replyTopic(uid,req, res, next);
					}

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
				req.wxsession.fastPost = {content:[],isNew:true};
				delete req.wxsession._wait;
				return res.reply('请输入标题');
			}else if (message.MsgType==="event" && message.Event==="CLICK" && message.EventKey==="FAST_REPLY"){
				req.wxsession.fastPost = {content:[],title:"Not needed",isNew:false};
				delete req.wxsession._wait;
				return showTopicListForUser(openid,req.wxsession.topics||[],function(){
					res.wait('topic_'+openid);
				});
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
				return res.wait('bind');
			}else if (message.Event==="CLICK" && message.EventKey==="FAST_REPLY"){
				return res.wait('bind');
			}else{
				return res.reply();
				//return res.transfer2CustomerService(kfAccount);
			}
		}
	});
}


function uploadMediaToCloud(mediaId,callback){
	wechatapi.getLatestToken(function(err,result){
		if(err) return callback(err);
		wechatapi.getMedia(mediaId,function(err,data,res){
			if(err) return callback(err);
			//content-disposition': 'attachment; filename="zbS8yLf7lxXt1vA2cqcIoUYPPyrR1mytXA1olZgBlmndEeuNHa7eYp1Cv-u-gpOg.jpg"'
			var filename = res.headers['content-disposition'].match(/(filename=\")(.*)(\")/)[2];
			avcloud.uploadFile(filename,res.headers['content-type'],data,function(err,data){
				if(err) return callback(err);
				callback(null,data.url);
			});

		});
	});
}

function thumbnailURL(url, width, height, quality, scaleToFit, fmt){
	if(!width|| width<=0){
		throw "Invalid width value."
	}
	quality = quality || 100;
	scaleToFit = (scaleToFit == null) ? true: scaleToFit;
	if(quality<=0 || quality>100){
		throw "Invalid quality value."
	}
	fmt = fmt || 'png';
	var mode = scaleToFit ? 2: 1;

	if (!height) return url + '?imageView/' + mode + '/w/' + width;
	return url + '?imageView/' + mode + '/w/' + width + '/h/' + height
		+ '/q/' + quality + '/format/' + fmt;
}

function copyRemoteToCloud(url,callback){
	callback(null,url);//TODO
}

function sendText(openid,text,callback){
	callback = callback || function(){};
	wechatapi.getLatestToken(function(err,result){
		if (err) return callback(err);
		wechatapi.sendText(openid,text,function(err,result){
			callback(err,result);
		});
	});
}

function sendNews(openid,payload,callback){
	callback = callback || function(){};
	wechatapi.getLatestToken(function(err,result){
		if (err) return callback(err);
		wechatapi.sendNews(openid,payload,function(err,result){
			callback(err,result);
		});
	});
}

function getJsConfig(data,callback){
	callback = callback || function(){};
	wechatapi.getLatestToken(function(err,result){
		if(err){
			return callback(err);
		}
		wechatapi.getJsConfig(data,function(err,config){
			callback(err,config);
		});
	});
}



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


function paymentResultNotify(req, res, next) {

}

function alarmNotify(req, res, next) {

}


function wechatJSConfig(req,res){
	var url = req.query.url;
	if (url){
		getJsConfig({url: url},function(err,data){
			if(err){
				return res.status(500).json(err);
			}
			data.url = url;
			res.json(data);
		});
	}else{
		res.status(400).json({ error: 'No url parameter' });
	}
}

function wxBind(req,res){
	var openid = req.query.openid;
	if(openid) req.session._openid = openid;
	delete req.session._wechatAuthed;
	res.redirect(nconf.get('relative_path')+"/login");
}

plugin.userLoggedIn = function(params){
	var uid = params.uid;
	var openid = params.req.session._openid;
	var req = params.req;
	if (openid){
		user.getUserField(uid, "openid", function(err, xopenid) {
			//if user is already assocaited
			if (err || xopenid) return sendText(openid,"绑定错误,或者账号已绑定其他微信号");
			bindUser2Wechat(uid,openid,function(err){
				if (!err && !req.session._wechatAuthed){
					sendText(openid,"绑定成功,可以闪发秒回了");
				}
			});
		});
	}
};



plugin.parsePost = function(params, callback){
	var post = params.postData;
	processPost(post,function(err,data){
		params.postData = data;
		callback(err,params);
	});
};

function processPost(data, callback){
	if (data && data.content) {
		var finished = false;
		do{
			finished = processVideo(data);
		}while(finished);

		do{
			finished = processVoice(data);
		}while(finished);

		do{
			finished = processLocation(data);
		}while(finished);
	}
	callback(null, data);
};

function processVideo(data){
	var videoSetting = /(\[video )(.*)(\])/.exec(data.content);
	if (!!videoSetting && videoSetting.length > 2) {
		var thumbnail_attr = /(thumbnail=\()(.*?)(\))/.exec(videoSetting[2]);
		var url_attr = /(url=\()(.*?)(\))/.exec(videoSetting[2]);
		var id_attr = /(id=\()(.*?)(\))/.exec(videoSetting[2]);
		if (!!thumbnail_attr && thumbnail_attr.length > 2) thumbnail_attr = S(thumbnail_attr[2]).stripTags().s;
		if (!!url_attr && url_attr.length > 2) url_attr = S(url_attr[2]).stripTags().s;
		if (!!id_attr && id_attr.length > 2) id_attr = S(id_attr[2]).stripTags().s;
		var divElem = "<div id='"+id_attr+"' data-type='video' data-thumbnail='"+thumbnail_attr+"' data-url='"+url_attr+"'></div>";
		data.content = data.content.replace(videoSetting[0],divElem);
		return true;
	}else{
		return false;
	}
}

function processVoice(data){
	var voiceSetting = /(\[voice )(.*)(\])/.exec(data.content);
	if (!!voiceSetting && voiceSetting.length > 2) {
		var text_attr = /(text=\()(.*?)(\)\s)/.exec(voiceSetting[2]);
		var url_attr = /(url=\()(.*?)(\))/.exec(voiceSetting[2]);
		var id_attr = /(id=\()(.*?)(\))/.exec(voiceSetting[2]);
		if (!!text_attr && text_attr.length > 2) text_attr = S(text_attr[2]).stripTags().s;
		if (!!url_attr && url_attr.length > 2) url_attr = S(url_attr[2]).stripTags().s;
		if (!!id_attr && id_attr.length > 2) id_attr = S(id_attr[2]).stripTags().s;
		var divElem = "<div id='"+id_attr+"' data-type='voice' data-url='"+url_attr+"'>"+text_attr+"</div>";
		data.content = data.content.replace(voiceSetting[0],divElem);
		return true;
	}else{
		return false;
	}
}

function processLocation(data){
	var locationSetting = /(\[location )(.*)(\])/.exec(data.content);
	if (!!locationSetting && locationSetting.length > 2) {
		var x_attr = /(locx=\()(.*?)(\))/.exec(locationSetting[2]);
		var y_attr = /(locy=\()(.*?)(\))/.exec(locationSetting[2]);
		var name_attr = /(name=\()(.*?)(\)\s)/.exec(locationSetting[2]);
		var scale_attr = /(scale=\()(.*?)(\))/.exec(locationSetting[2]);
		var id_attr = /(id=\()(.*?)(\))/.exec(locationSetting[2]);
		if (!!x_attr && x_attr.length > 2) x_attr = S(x_attr[2]).stripTags().s;
		if (!!y_attr && y_attr.length > 2) y_attr = S(y_attr[2]).stripTags().s;
		if (!!name_attr && name_attr.length > 2) name_attr = S(name_attr[2]).stripTags().s;
		if (!!scale_attr && scale_attr.length > 2) scale_attr = S(scale_attr[2]).stripTags().s;
		if (!!id_attr && id_attr.length > 2) id_attr = S(id_attr[2]).stripTags().s;
		var divElem = "<div data-type='location' data-x='"+x_attr+"' data-y='"+y_attr+"' data-scale='"+scale_attr+"'>"+name_attr+"<div id='"+id_attr+"'></div>"+"</div>";
		data.content = data.content.replace(locationSetting[0],divElem);
		return true;
	}else{
		return false;
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
			'    "openid": "",' + '\n' +
			'    "token": "",' + '\n' +
			'    "encodingAESKey": "",' + '\n' +
			'    "payment_mch_id": "",' + '\n' +
			'    "payment_api_key": "",' + '\n' +
			'    "payment_notify_url": "",' + '\n' +
			'    "secure_domain": ""' + '\n' +
			'}\n'+
			' and/or (wechat sso for web site):\n' +
			'"wechatweb": {' + '\n' +
			'    "appid": "",' + '\n' +
			'    "appsecret": ""' + '\n' +
			'}\n'+
			'==========================================================='
		);
		winston.error("Unable to initialize wechat-official-account!");
		return callback();
	}

	if (!nconf.get("avcloud")){
		winston.info(
			'\n===========================================================\n'+
			'Please, add parameters for avcloud in config.json\n'+
			'"avcloud": {' + '\n' +
			'    "appid": "",' + '\n' +
			'    "appkey": ""' + '\n' +
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
					scope: "snsapi_userinfo",//"snsapi_base"
					state:1
				},
				function(accessToken, refreshToken, profile, done) {
					login(profile,false,done);//loginByOpenid(profile.openid,done);
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

plugin.notificationPushed = function(params){
	var notifObj = params.notification;
	var uids = params.uids;
	console.dir(notifObj);
	async.waterfall([
		function(next) {
			var language = meta.config.defaultLang || 'en_GB';

			notifObj.bodyLong = notifObj.bodyLong || '';
			notifObj.bodyLong = S(notifObj.bodyLong).unescapeHTML().stripTags().unescapeHTML().s;
			async.parallel({
				title: function(next) {
					translator.translate(notifObj.bodyShort, language, function(translated) {
						next(undefined, S(translated).stripTags().s);
					});
				},
				pic:async.apply(user.getUserField,notifObj.from,'picture'),
				topicTitle: async.apply(topics.getTopicFieldByPid, 'title', notifObj.pid),
				topicSlug: async.apply(topics.getTopicFieldByPid, 'slug', notifObj.pid)
			}, next);
		},
		function(data, next) {
			//picurl:data.pic,
			var	payload = [
				{
					title:data.title,
					description:notifObj.bodyLong
				}
			];
			if (data.topicSlug) payload[0].url = nconf.get('url') + '/topic/' + data.topicSlug;
			if (notifObj.user) payload[0].url = nconf.get('url') + '/user/' + notifObj.user.userslug;
			if (notifObj.path) payload[0].url = nconf.get('url') + notifObj.path;
			//console.dir(payload);
			user.getMultipleUserFields(uids,['openid'],function(err,users){
				users.forEach(function(user){
					//console.dir(user);
					if (user.openid){
						sendNews(user.openid,payload,function(err,result){});
						if(notifObj.tid){
							db.get("sess:"+user.openid+":"+nconf.get("wechat:openid"),function(err,str){
								if (err) return;
								var wxsession = JSON.parse(str);
								wxsession.topics = wxsession.topics||[];
								topicsUniqueSortAdd(wxsession.topics,notifObj.tid,data.topicTitle);
								db.set("sess:"+user.openid+":"+nconf.get("wechat:openid"),JSON.stringify(wxsession),function(err,result){});
							});
						}
					}
				});
			});
		}
	]);
};

module.exports = plugin;

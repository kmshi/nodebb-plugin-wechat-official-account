"use strict";

/*globals ajaxify, config, utils, NProgress*/

var jsApiList = ['getNetworkType','openLocation','hideOptionMenu','onMenuShareAppMessage'];

function configureWeChat(path){
	$.ajax({
		url: RELATIVE_PATH + '/api/wechatJSConfig?url=' + encodeURIComponent(path),
		cache: false,
		success: function(data) {
			data.debug = false;
			data.jsApiList = jsApiList;
			//alert(JSON.stringify(data));
			wx.config(data);
			wx.ready(function(){
				//wx.hideOptionMenu();
				wx.onMenuShareAppMessage({
					title:ajaxify.data.name || ajaxify.data.title || $("meta[name='title']").attr("content"),
					desc:ajaxify.data.description || (ajaxify.data.posts && ajaxify.data.posts[0].content) || $("meta[name='description']").attr("content"),
					link:window.location.href,
					imgUrl:($("img:not(.hide):not(.user-img)")[0] && $("img:not(.hide):not(.user-img)")[0].src)||'',
					type:'link',
					dataUrl:''
				});
			});
			wx.error(function(err){
				alert(JSON.stringify(err));
			});
		},
		error: function(data, textStatus) {
		}
	});

}

$(document).ready(function() {
	var ua = navigator.userAgent.toLowerCase();
	var isWeChat = (ua.match(/micromessenger/i) != null);
	var origUrl = window.location.href.split('#')[0];
	if (isWeChat){
		$(window).on('action:ajaxify.end', function() {
			//funny,you have to config everytime but with old url when history pushstate changes
			if (isWeChat) configureWeChat(origUrl);
		});
	}else {
		window.wx = {};
		var nullFunc = function(){};
		for(var idx in jsApiList){
			window.wx[jsApiList[idx]]=nullFunc;
		}
	}

	$("#getNetworkType").on('click',function(){
		wx.getNetworkType({
			success: function (res) {
				alert(res.networkType);
			},
			fail: function (res) {
				alert(JSON.stringify(res));
			}
		});
	});

	$("#openLocation").on('click',function(){
		wx.openLocation({
			latitude: 23.099994,
			longitude: 113.324520,
			name: 'TIT 创意园',
			address: '广州市海珠区新港中路 397 号',
			scale: 14,
			infoUrl: 'http://weixin.qq.com'
		});
	});

	$(window).on('action:posts.loaded action:topic.loaded action:posts.edited', function () {
		$("div[data-type='video']").each(function(){
			var options = {
				playlist: [{
					sources: [{
						file: $(this).attr('data-url'),
						type: 'mp4'
					}],
					image: $(this).attr('data-thumbnail')
				}],
				flashplayer:'/plugins/nodebb-plugin-wechat-official-account/jwplayer/jwplayer.flash.swf',
				html5player: '/plugins/nodebb-plugin-wechat-official-account/jwplayer/jwplayer.html5.js',
				autostart:false,
				width: "100%",
				aspectratio: "16:9",
				primary: "html5"
			}
			jwplayer($(this).attr('id')).setup(options);
		});

	});
});
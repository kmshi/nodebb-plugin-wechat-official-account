"use strict";

/*globals ajaxify, config, utils, NProgress*/

$(document).ready(function() {
	var ua = navigator.userAgent.toLowerCase();
	var isWeChat = (ua.match(/micromessenger/i) != null);
	var jsApiList = ['getNetworkType','openLocation','hideOptionMenu','onMenuShareTimeline','onMenuShareAppMessage'];
	if (isWeChat){
		$(window).on('action:ajaxify.end', function() {
			$.ajax({
				url: RELATIVE_PATH + '/api/wechatJSConfig?url=' + encodeURIComponent(window.location.href.split('#')[0]),
				cache: false,
				success: function(data) {
					//data.debug = true;
					data.jsApiList = jsApiList;
					wx.config(data);
					wx.ready(function(){
						wx.hideOptionMenu();
						/*
						wx.onMenuShareTimeline({
							title: '', // 分享标题
							link: '', // 分享链接
							imgUrl: '', // 分享图标
							success: function () {
								// 用户确认分享后执行的回调函数
							},
							cancel: function () {
								// 用户取消分享后执行的回调函数
							}
						});
						wx.onMenuShareAppMessage({
							title: '', // 分享标题
							desc: '', // 分享描述
							link: '', // 分享链接
							imgUrl: '', // 分享图标
							type: '', // 分享类型,music、video或link，不填默认为link
							dataUrl: '', // 如果type是music或video，则要提供数据链接，默认为空
							success: function () {
								// 用户确认分享后执行的回调函数
							},
							cancel: function () {
								// 用户取消分享后执行的回调函数
							}
						});
						wx.getNetworkType({
							success: function (res) {
								alert(res.networkType);
							},
							fail: function (res) {
								alert(JSON.stringify(res));
							}
						});

						wx.openLocation({
							latitude: 23.099994,
							longitude: 113.324520,
							name: 'TIT 创意园',
							address: '广州市海珠区新港中路 397 号',
							scale: 14,
							infoUrl: 'http://weixin.qq.com'
						});
						*/
					});
					wx.error(function(err){
						alert(JSON.stringify(err));
					});
				},
				error: function(data, textStatus) {
				}
			});
		});
	}else {
		window.wx = {};
		var nullFunc = function(){};
		for(var idx in jsApiList){
			window.wx[jsApiList[idx]]=nullFunc;
		}
	}
});
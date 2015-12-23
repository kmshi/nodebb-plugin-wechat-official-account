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
				var title = ajaxify.data.name || ajaxify.data.title || $("meta[name='title']").attr("content");
				var desc = ajaxify.data.description || (ajaxify.data.posts && ajaxify.data.posts[0].content) || $("meta[name='description']").attr("content");
				var link = window.location.href+"?parentUid="+app.user.uid;
				var imgUrl = ($("img:not(.hide):not(.user-img)")[0] && $("img:not(.hide):not(.user-img)")[0].src)||'';
				wx.onMenuShareAppMessage({
					title:title,
					desc:desc,
					link:link,
					imgUrl:imgUrl,
					type:'link',
					dataUrl:''
				});
				wx.onMenuShareTimeline({
					title:title,
					link:link,
					imgUrl:imgUrl
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

	$(document).on('click',"div[data-type='location']",function(){
		var x = parseFloat($(this).attr('data-x'));
		var y = parseFloat($(this).attr('data-y'));
		wx.openLocation({
			latitude: x,
			longitude: y,
			name: $(this)[0].textContent.substring(0,8),
			address: $(this)[0].textContent,
			scale: parseInt($(this).attr('data-y'),10)
			//infoUrl: 'http://weixin.qq.com'
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

		$("div[data-type='location']").each(function(){
			if ($(this).find("div").length!==1) return;
			if (isWeChat){
				$(this).css('text-decoration','underline');
				$(this).find("div").replaceWith('<i class="fa fa-location-arrow"></i>');
				return;
			}

			$("#"+$(this).find("div").attr('id')).css('width','100%').css('height','300px');

			//var map = new BMap.Map($(this).find("div").attr('id'));
			//var point = new BMap.Point(Number.parseFloat($(this).attr('data-x')),Number.parseFloat($(this).attr('data-y')));
			//map.centerAndZoom(point,Number.parseInt($(this).attr('data-scale')));
			//var marker = new BMap.Marker(point);
			//var label = new BMap.Label("我在这里!!!",{offset:new BMap.Size(20,0)});
			//marker.setLabel(label);
			//map.addOverlay(marker);

			var center = new qq.maps.LatLng(parseFloat($(this).attr('data-x')),parseFloat($(this).attr('data-y')));
			var map = new qq.maps.Map(document.getElementById($(this).find("div").attr('id')),{
				center: center,
				zoom: parseInt($(this).attr('data-scale'),10)
			});
			map.setOptions({
				keyboardShortcuts : false, //设置禁止通过键盘控制地图。默认情况下启用键盘快捷键。
				scrollwheel : false        //设置滚动缩放默认不允许
			});
			setTimeout(function(){
				var marker=new qq.maps.Marker({
					position:center,
					animation:qq.maps.MarkerAnimation.DROP,
					map:map
				});
				//marker.setAnimation(qq.maps.Animation.DROP);
				var infoWin = new qq.maps.InfoWindow({
					map: map
				});
				infoWin.open();
				infoWin.setContent('<div style="width:80px;">我在这里!!!</div>');
				infoWin.setPosition(center);
			},2000);
		});

	});
});
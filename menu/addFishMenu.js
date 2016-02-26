/**
 * Created by kshi on 2/26/16.
 */
var nconf = require('nconf');
var path = require('path');
nconf.argv().env('__');
var	configFile = path.join(__dirname, '../config.json');
nconf.file({
	file: configFile
});

var API = require('wechat-api');
var api = new API(nconf.get("wechat:appid"), nconf.get("wechat:appsecret"));
//var api = new API("wx8f683cb11ad3ddc7", "28ec371035f4fc75b8e01038c1cfea0b");
var menu = JSON.stringify(require('./menuFish.json'));
api.createMenu(menu,function(err,result){
	if(err){
		console.log(err);
		return;
	}
	console.log(result);
});

var rest = require('restler');
var qiniu = require('qiniu');//for upload file

function _parseDate(iso8601) {
    var regexp = new RegExp(
      "^([0-9]{1,4})-([0-9]{1,2})-([0-9]{1,2})" + "T" +
      "([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2})" +
      "(.([0-9]+))?" + "Z$");
    var match = regexp.exec(iso8601);
    if (!match) {
      return null;
    }

    var year = match[1] || 0;
    var month = (match[2] || 1) - 1;
    var day = match[3] || 0;
    var hour = match[4] || 0;
    var minute = match[5] || 0;
    var second = match[6] || 0;
    var milli = match[8] || 0;

    return new Date(Date.UTC(year, month, day, hour, minute, second, milli));
}

var AV = rest.service(function(applicationId, applicationKey) {
  this.defaults.headers = {};
  this.defaults.headers["X-AVOSCloud-Application-Id"] = applicationId;
  this.defaults.headers["X-AVOSCloud-Application-Key"] = applicationKey;
}, {
  //baseURL: 'https://leancloud.cn/1.1'
}, {
  saveObj: function(className,obj,ownerObjectId,sessionToken,masterKey,callback) {
    if(sessionToken) this.defaults.headers["X-AVOSCloud-Session-Token"] = sessionToken;
    if(masterKey) this.defaults.headers["X-AVOSCloud-Master-Key"] = masterKey;
    var deepCopy = {};
    Object.keys(obj).forEach(function(key) {
      deepCopy[key] = obj[key];
    });
    delete deepCopy.createdAt;
    delete deepCopy.updatedAt;
    if(deepCopy.objectId){
      //deepCopy.createdAt = { "__type": "Date", "iso": deepCopy.createdAt};
      this.json('PUT','https://leancloud.cn/1.1/classes/'+className+'/'+deepCopy.objectId,deepCopy)
      .on("success",function(data){
        if (data.updatedAt) obj.updatedAt = _parseDate(data.updatedAt);
		  callback(null,obj);
      }).on("error",function(error){
		  callback(error);
      }).on("fail",function(error){
		  callback(error);
      });
    }else{
      if (ownerObjectId){
        deepCopy.ACL = {"*":{"read":true}};
        deepCopy.ACL[ownerObjectId] = {"write":true,"read":true};
      }
      this.json('POST','https://leancloud.cn/1.1/classes/'+className,deepCopy)
      .on("success",function(data){
        if (data.objectId) obj.objectId = data.objectId;
        if (data.createdAt) obj.createdAt = _parseDate(data.createdAt);
		  callback(null,obj);
      }).on("error",function(error){
		  callback(error);
      }).on("fail",function(error){
		  callback(error);
      });
    }
    delete this.defaults.headers["X-AVOSCloud-Session-Token"];
    delete this.defaults.headers["X-AVOSCloud-Master-Key"];
  },
  getObj: function(className,objectId,callback){
    var obj={};
    this.json('GET','https://leancloud.cn/1.1/classes/'+className+'/'+objectId)
    .on("success",function(data){
      Object.keys(data).forEach(function(key) {
        obj[key] = data[key];
      });
      if (obj.createdAt) obj.createdAt = _parseDate(data.createdAt);
      if (obj.updatedAt) obj.updatedAt = _parseDate(data.updatedAt);
		callback(null,obj);
    }).on("error",function(error){
		callback(error);
    }).on("fail",function(error){
		callback(error);
    });
  },
  delObj: function(className,objectId,sessionToken,callback){
    if(sessionToken) this.defaults.headers["X-AVOSCloud-Session-Token"] = sessionToken;
    this.json('DELETE','https://leancloud.cn/1.1/classes/'+className+'/'+objectId)
    .on("success",function(data){
		callback(null,data);
    }).on("error",function(error){
		callback(error);
    }).on("fail",function(data){
		callback(data);
    });
    delete this.defaults.headers["X-AVOSCloud-Session-Token"];
  },
  query: function(className,obj,callback){
    this.get('https://leancloud.cn/1.1/classes/'+className,{data:obj})
    .on("success",function(data){
		callback(null,data);
    }).on("error",function(error){
		callback(error);
    }).on("fail",function(data){
		callback(data);
    });
  },
  cql:function(obj,callback){
    this.get('https://leancloud.cn/1.1/cloudQuery',{data:obj})
    .on("success",function(data){
		callback(null,data);
    }).on("error",function(error){
		callback(error);
    }).on("fail",function(data){
		callback(data);
    });
  },
  register:function(username,password,callback){
    var user = {};
    user.username = username;
    user.password = password;
    this.json('POST','https://leancloud.cn/1.1/users',user)
    .on("success",function(data){
		callback(null,data);
    }).on("error",function(error){
		callback(error);
    }).on("fail",function(data){
		callback(data);
    });
  },
  getUser:function(userObjectId,callback){
    var obj={};
    this.json('GET','https://leancloud.cn/1.1/users/'+userObjectId)
    .on("success",function(data){
      Object.keys(data).forEach(function(key) {
        obj[key] = data[key];
      });
      if (obj.createdAt) obj.createdAt = _parseDate(data.createdAt);
      if (obj.updatedAt) obj.updatedAt = _parseDate(data.updatedAt);
		callback(null,obj);
    }).on("error",function(error){
		callback(error);
    }).on("fail",function(data){
		callback(data);
    });
  },
  mobileConnect:function(mobilePhoneNumber,smsCode,callback){
    var user = {};
    user.mobilePhoneNumber = mobilePhoneNumber;
    user.smsCode = smsCode;
    this.json('POST','https://leancloud.cn/1.1/usersByMobilePhone',user)
    .on("success",function(data){
		callback(null,data);
    }).on("error",function(error){
		callback(error);
    }).on("fail",function(data){
		callback(data);
    });
  },
  requestSmsCode:function(mobilePhoneNumber,callback){
    var obj = {};
    obj.mobilePhoneNumber = mobilePhoneNumber;
    this.json('POST','https://leancloud.cn/1.1/requestSmsCode',obj)
    .on("success",function(data){
		callback(null,data);
    }).on("error",function(error){
		callback(error);
    }).on("fail",function(data){
		callback(data);
    });
  },
  login:function(username,password,callback){
    var obj = {};
    obj.username = username;
    obj.password = password;
    this.get('https://leancloud.cn/1.1/login',{data:obj})
    .on("success",function(data){
		callback(null,data);
    }).on("error",function(error){
		callback(error);
    }).on("fail",function(data){
		callback(data);
    });
  },
  socialConnect:function(type,tokenData,callback){
    var data = {authData:{}};
    data.authData[type]=tokenData;

    this.json('POST','https://leancloud.cn/1.1/users',data)
    .on("success",function(data){
		callback(null,data);
    }).on("error",function(error){
		callback(error);
    }).on("fail",function(data){
		callback(data);
    });
  },
  bindUserMobilePhone:function(userObjectId,mobilePhoneNumber,sessionToken,callback){
    var user = {};
    user.mobilePhoneNumber = mobilePhoneNumber;
    if(sessionToken) this.defaults.headers["X-AVOSCloud-Session-Token"] = sessionToken;
    this.json('PUT','https://leancloud.cn/1.1/users/'+userObjectId,user)
    .on("success",function(data){
		callback(null,data);
    }).on("error",function(error){
		callback(error);
    }).on("fail",function(data){
		callback(data);
    });
    delete this.defaults.headers["X-AVOSCloud-Session-Token"];
  },
  bindUserInfo:function(userObjectId,userInfo,sessionToken,callback){
    if(sessionToken) this.defaults.headers["X-AVOSCloud-Session-Token"] = sessionToken;
    this.json('PUT','https://leancloud.cn/1.1/users/'+userObjectId,userInfo)
    .on("success",function(data){
		callback(null,data);
    }).on("error",function(error){
		callback(error);
    }).on("fail",function(data){
		callback(data);
    });
    delete this.defaults.headers["X-AVOSCloud-Session-Token"];
  },
  requestMobilePhoneVerify:function(mobilePhoneNumber,callback){
    this.json('POST','https://leancloud.cn/1.1/requestMobilePhoneVerify',{"mobilePhoneNumber":mobilePhoneNumber})
    .on("success",function(data){
		callback(null,data);
    }).on("error",function(error){
		callback(error);
    }).on("fail",function(data){
		callback(data);
    });
  },
  verifyMobilePhone:function(code,callback){
    this.json('POST','https://leancloud.cn/1.1/verifyMobilePhone/'+code,{})
    .on("success",function(data){
		callback(null,data);
    }).on("error",function(error){
		callback(error);
    }).on("fail",function(data){
		callback(data);
    });
  },
  uploadFile:function(name,mime_type,buffer,callback){
    //Create 16-bits uuid as qiniu key.
    var hexOctet = function() {
      return Math.floor((1+Math.random())*0x10000).toString(16).substring(1);
    };
    //var key = hexOctet() + hexOctet() + hexOctet() + hexOctet();
	var key = name.length>16?name:hexOctet() + hexOctet() + hexOctet() + hexOctet() + name;//make sure key is unique
    var metaData = {mime_type:mime_type,size:buffer.length};
    var data = {key:key,name:name,mime_type:mime_type,metaData:metaData};
    this.json('POST','https://leancloud.cn/1.1/qiniu',data)
    .on("success",function(data){
      var extra = new qiniu.io.PutExtra();
      extra.mimeType = mime_type;
      qiniu.io.put(data.token,key,buffer,extra,function(err,ret){
        if (err){
			callback(err);
        }else{
			callback(null,data);
        }
      });
    }).on("error",function(error){
		callback(error);
    }).on("fail",function(data){
		callback(data);
    });
  }
});

module.exports = AV;
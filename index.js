var request = require("superagent");
var crypto = require("crypto");
var debug = require("debug")("MailgunTransport");
var EventEmitter = require("events").EventEmitter;
var utillib = require("util");
var packageData = require("./package.json");

var baseUrl = "https://api.mailgun.net/v2";

var MailgunTransport = function(options){
  EventEmitter.call(this);
  this.name = "Mailgun";
  this.version = packageData.version;
  this.options = options || {};
  this.baseUrl = baseUrl + (this.options.domain? ("/" + this.options.domain): "");
};

utillib.inherits(MailgunTransport, EventEmitter);

MailgunTransport.prototype.send = function(mail, callback) {
  var options = this.options;
  var id;
  if(this.options.domain){
    id = (mail.message.getHeader("Message-Id") || "").replace(/[<>\s]/g, "");
    id = id.substr(0, id.indexOf("@") + 1) +  this.options.domain;
    mail.message.setHeader("Message-Id", "<" + id + ">");
  }

  var req = request.post(this.baseUrl + "/messages.mime").auth("api", this.options.apiKey);
  var part = req.part().name("message").type("eml");
  debug("Preparing EML");
  var stream = mail.message.createReadStream();
  stream.on("error", function(err){
    debug("Error on preparing EML");
    debug(err);
    callback(err);
  });
  stream.on("data", function(buf){
    part.write(buf);
  });
  stream.on("end", function(){
    debug("EML is ready. Sending now.")
    req.field("to", mail.message.getEnvelope().to.join(","));
    req.field("o:testmode", options.testMode?"yes":"no");
    req.end(function(err){
      if(err){
        debug("Error on sending email");
        debug(err);
        callback(err);
      }
      else{
        debug("Sent email message with id %s", id);
        callback(null, {messageId: id});
      }
    });
  });
};

function pattern2regexp(pattern){
  return "^" + pattern.replace(/\+/g, "\\+").replace(/\-/g, "\\-").replace(/\./g, "\\.").replace("{ID}", "(\\w+)") +"$";
}

MailgunTransport.prototype.registerEmailPattern = function(pattern, callbackUrl, description, callback){
  if(!pattern) return callback(Error("'pattern' is required"));
  if(!callbackUrl) callback(Error("'callbackUrl' is required"));
  if(!description) callback(Error("'description' is required"));
  var req = request.get(this.baseUrl + "/routes").auth("api", this.options.apiKey).query({limit: 1000});
  req.end(function(err, res){
    if(err) return callback(err);
    var routes = res.body.items;
    var ptrn = "match_recipient(\"" + pattern2regexp(pattern) + "\")";
    var destination = "forward(\"" + callbackUrl + "\")";
    var list = routes.filter(function(r){
      return r.expression == ptrn && (r.actions || [])[0] == destination;
    });
    if(list.length == 0){
      debug("Registering new route %s -> %s on the Mailgun server", ptrn, destination);
      var req = request.post(this.baseUrl + "/routes").auth("api", this.options.apiKey);
      req.send({expression: ptrn, action: [destination, "stop()"], description: description});
      req.end(function(err, res){
        if(err) return callback(err);
        callback(null, res.body.route.id);
      });
    }
    else{
      debug("Using existing route %s -> %s on the Mailgun server", ptrn, destination);
      callback(null, list[0].id);
    }
  });
};


MailgunTransport.prototype.parseMessage = function(message){
  return {
    externalId: message["Message-Id"].replace("<", "").replace(">", "").trim(),
    from: message.sender,
    to: message.recipient,
    subject: message.subject,
    htmlBody: message["stripped-html"],
    textBody: message["stripped-text"],
    messageHeaders: JSON.parse(message["message-headers"] || "[]"),
    userAgent: message["User-Agent"],
    references: message["References"],
    variables: JSON.parse(message["X-Mailgun-Variables"] || "{}")
  };
};

MailgunTransport.prototype.verifySignature = function(token, timestamp, signature){
  if(!token || !timestamp || !signature) return false;
  return signature == crypto.createHmac("sha256", this.apiKey).update(timestamp + token).digest("hex");
}


module.exports = function(options){
  return new MailgunTransport(options);
};

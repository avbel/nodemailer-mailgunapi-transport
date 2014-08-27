var transportFactory = require("..");
var nock = require("nock");
var crypto = require("crypto");
var PassThrough = require("stream").PassThrough;



function MockBuilder(envelope, message) {
    this.envelope = envelope;
    this.message = new PassThrough();
    this.message.end(message);
    this.headers = {}
}

MockBuilder.prototype.getEnvelope = function() {
    return this.envelope;
};

MockBuilder.prototype.createReadStream = function() {
    return this.message;
};

MockBuilder.prototype.getHeader = function(name) {
  return this.headers[name] || "header";
};

MockBuilder.prototype.setHeader = function(name, value) {
  this.headers[name] = value;
};


var MAILGUN_API = "https://api.mailgun.net/";
var API_KEY = "NOT_A_VALID_KEY";
var TOKEN = (new Buffer("api:" + API_KEY)).toString("base64");


describe("mailgun transport", function(){
  var body, routes = [], counter = 1, postRoutes, getRoutes;
  before(function(){
    nock(MAILGUN_API)
      .filteringRequestBody(function(b){
        return body = b;
      })
      .matchHeader("Authorization", "Basic " + TOKEN)
      .post("/v2/messages.mime")
      .reply(200, {id: "id"})
      .matchHeader("Authorization", "Basic " + TOKEN)
      .post("/v2/test.com/messages.mime")
      .reply(200);
    getRoutes = nock(MAILGUN_API)
      .matchHeader("Authorization", "Basic " + TOKEN)
      .get("/v2/routes?limit=1000")
    postRoutes = nock(MAILGUN_API)
      .matchHeader("Authorization", "Basic " + TOKEN)
      .filteringRequestBody(function(b){
        if(b){
          var item = JSON.parse(b);
          item.id = counter ++;
          item.actions = item.action;
          routes.unshift(item);
        }
        return b;
      })
      .post("/v2/routes");

    nock.disableNetConnect();
  });
  after(function(){
    nock.enableNetConnect();
  });
  beforeEach(function(){
    body = "";
  });
  it("should provide name and version", function(){
    var transport = transportFactory();
    transport.name.should.be.ok;
    transport.version.should.be.ok;
  });
  describe("#send", function(){
    it("should send email message via mailgun", function(done){
      var transport = transportFactory({apiKey: API_KEY});
      var message = "This is a message";
      transport.send({
        data: {},
        message: new MockBuilder({
          from: "test@valid.sender",
          to: "test@valid.recipient"
        }, message)
      }, function(err, info) {
        (!err).should.be.true;
        info.messageId.should.equal("id");
        (body.indexOf("This is a message") >= 0).should.be.true;
        done();
      });
    });
    it("should send email message via mailgun (with own domain)", function(done){
      var transport = transportFactory({apiKey: API_KEY, domain: "test.com"});
      var message = "This is a message";
      transport.send({
        data: {},
        message: new MockBuilder({
          from: "test@valid.sender",
          to: "test@valid.recipient"
        }, message)
      }, function(err, info) {
        (!err).should.be.true;
        info.messageId.should.equal("header@test.com");
        (body.indexOf("This is a message") >= 0).should.be.true;
        done();
      });
    });
  });
  describe("#registerEmailPattern", function(){
    it("should register route from incoming email redirection to url (via webhook)", function(done){
      var transport = transportFactory({apiKey: API_KEY});
      postRoutes.reply(200, {route: {id: counter}});
      getRoutes.reply(200, {items: routes});
      transport.registerEmailPattern("reply-{ID}@test.com", "http://www.test.com/incomingEmailCallback", "description", function(err, routeId){
        if(err) return done(err);
        routeId.should.be.ok;
        routeId.should.not.equal(counter);
        routes[0].id.should.equal(routeId);
        postRoutes.reply(404, "Not found");
        getRoutes.reply(200, {items: routes});
        //should use same route
        transport.registerEmailPattern("reply-{ID}@test.com", "http://www.test.com/incomingEmailCallback", "description", function(err, rId){
          if(err) return done(err);
          routeId.should.equal(rId);
          done();
        });
      });
    });
  });
  describe("#parseMessage", function(){
    it("should parse incoming webhook data from mailgun to object", function(){
      var transport = transportFactory({apiKey: API_KEY});
      var msg = transport.parseMessage({
        "Message-Id": "<id@test.com>",
        sender: "from",
        recipient: "to",
        subject: "subject",
        "stripped-html": "html content",
        "stripped-text": "text content",
        "message-headers": "[]",
        "User-Agent": "agent",
        "References": "ref",
        "X-Mailgun-Variables": "{\"variable1\": 1}"
      });
      msg.id.should.equal("id@test.com");
      msg.from.should.equal("from");
      msg.to.should.equal("to");
      msg.subject.should.equal("subject");
      msg.html.should.equal("html content");
      msg.text.should.equal("text content");
      msg.headers.should.eql([]);
      msg.userAgent.should.equal("agent");
      msg.references.should.equal("ref");
      msg.variables.should.eql({variable1: 1});
    });
  });
  describe("#verifySignature", function(){
    it("should check signature of incoming message from webhook", function(){
      var token = "TOKEN";
      var timestamp = "STAMP";
      var signature = crypto.createHmac("sha256", API_KEY).update(timestamp + token).digest("hex");
      var transport = transportFactory({apiKey: API_KEY});
      transport.verifySignature(token, timestamp, signature).should.be.true;
      transport.verifySignature(token, timestamp, signature.substr(2) + "00").should.be.false;
    });
  });
});

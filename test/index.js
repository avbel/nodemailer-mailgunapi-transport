var transportFactory = require("..");
var nock = require("nock");
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
  var body;
  before(function(){
    nock(MAILGUN_API)
      .matchHeader("Authorization", "Basic " + TOKEN)
      .filteringRequestBody(function(b){
        return body = b;
      })
      .post("/v2/messages.mime")
      .reply(200, {id: "id"})
      .matchHeader("Authorization", "Basic " + TOKEN)
      .filteringRequestBody(function(b){
        return body = b;
      })
      .post("/v2/test.com/messages.mime")
      .reply(201);
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
});

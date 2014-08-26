var transportFactory = require("..");
var nock = require("nock");
var PassThrough = require("stream").PassThrough;

function MockBuilder(envelope, message) {
    this.envelope = envelope;
    this.message = new PassThrough();
    this.message.end(message);
}

MockBuilder.prototype.getEnvelope = function() {
    return this.envelope;
};

MockBuilder.prototype.createReadStream = function() {
    return this.message;
};

MockBuilder.prototype.getHeader = function() {
    return "header";
};


var MAILGUN_API = "https://api.mailgun.net/";
var API_KEY = "NOT_A_VALID_KEY";
var TOKEN = (new Buffer("api:" + API_KEY)).toString("base64");


describe("mailgun transport", function(){
  before(function(){
    nock(MAILGUN_API)
      .matchHeader("Authorization", "Basic " + TOKEN)
      .post("/v2/messages.mime")
      .filteringRequestBody(function(body){
        console.log(body);
        return "body";
      })
      .reply(200);
    nock.disableNetConnect();
  });
  after(function(){
    nock.enableNetConnect();
  });
  it.only("should provide name and version", function(){
    var transport = transportFactory();
    transport.name.should.be.ok;
    transport.version.should.be.ok;
  });
  describe("#send", function(){
    it("should send email message via mailgun", function(done){
      var transport = transportFactory({apiKey: "test"});
      var message = "This is a message";
      transport.send({
        data: {},
        message: new MockBuilder({
          from: "test@valid.sender",
          to: "test@valid.recipient"
        }, message)
      }, function(err, info) {
        (!err).should.be.true;
        info.messageId.should.be.ok;
        done();
      });
    });
  });
});

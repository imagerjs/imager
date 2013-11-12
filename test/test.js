
/**
 * Module dependencies.
 */

var Imager = require('../')
  , should = require('should')
  , imagerConfig = require('./imager')
  , files = [__dirname+'/fixtures/single.jpg', __dirname+'/fixtures/multiple-3.png']

var file

describe('new Imager()', function () {
  it('should throw if no parameters are passed', function () {
    (function () {
      var imager = new Imager()
    }).should.throw('Please provide the config')
  })

  it('should throw if no config is provided', function () {
    (function () {
      var imager = new Imager('Rackspace')
    }).should.throw('Please provide the config')
  })

  it('should throw if config is null or undefined', function () {
    (function () {
      var imager = new Imager(null, 'Rackspace')
    }).should.throw('Please provide the config')
  })

  it('should throw if config doesnt have storage', function () {
    (function () {
      var imager = new Imager({}, 'Rackspace')
    }).should.throw('Please specify a storage')
  })

  it('given proper config - should create the instances', function () {
    var imager = new Imager(imagerConfig, ['Local','Rackspace'])

    imager.config.should.have.property('variants')
    imager.config.should.have.property('storage')
    should.strictEqual('Local', imager.storage[0])
    should.strictEqual('Rackspace', imager.storage[1])
    imager.uploadedFiles.should.be.empty
  })
})

describe('Imager', function () {
  describe('#upload()', function () {
    it('should throw if no variant is provided', function () {
      (function () {
        var imager = new Imager(imagerConfig, 'Rackspace')
        imager.upload()
      }).should.throw('Please specify a proper variant OR provide a default')
    })

    it('should throw if the variant is not in the config', function () {
      (function () {
        var imager = new Imager(imagerConfig, 'Rackspace')
        imager.upload([], 'abc')
      }).should.throw('Please provide a variant which you have specified in the config file')
    })

    it('should do nothing if the files are not provided', function (done) {
      var imager = new Imager(imagerConfig, 'Rackspace')
      imager.upload([], function (err, cdnUri, files) {
        should.not.exist(err)
        should.not.exist(cdnUri)
        files.should.be.empty
        done()
      }, 'items')
    })

    describe('With local files', function () {
      it('should throw if the file paths are incorrect', function () {
        (function () {
          var imager = new Imager(imagerConfig, 'Rackspace')
          imager.upload(['abc.png'], 'items')
        }).should.throw(/ENOENT/)
      })

      it('should accept path of the file as string', function () {
        (function () {
          var imager = new Imager(imagerConfig, 'Rackspace')
          imager.upload(__dirname+'/fixtures/single.jpg', 'items')
        }).should.not.throw()
      })

      describe('With valid username/secret', function () {
        it('should upload the images to the cloud', function (done) {
          var imager = new Imager(imagerConfig, 'Rackspace')
          imager.upload(files, function (err, cdnUri, uploaded) {
            // uncomment this to test
            // 1. make sure you substitute key/secret in ./imager.js
            // 2. uncomment the below lines

            /*
            should.not.exist(err)
            should.exist(cdnUri)
            uploaded.should.not.be.empty
            uploaded.should.have.lengthOf(2)
            */

            done()
          }, 'items')
        })
      })

      describe('With invalid username/secret', function () {
        it('should throw with incorrect key/secret', function (done) {
          var imager = new Imager(imagerConfig, 'Rackspace')

          // unset the username
          imager.config.storage.Rackspace.username = 'xyz123'

          imager.upload(files, function (err, cdnUri, uploaded) {
            should.exist(err)
            err.statusCode.should.equal(401)
            done()
          }, 'items')
        })
      })
    })

    describe('With form files', function () {
      // write tests for form uploads
    })
  })

  describe('#remove()', function () {
    it('should throw if no variant is provided', function () {
      (function () {
        var imager = new Imager(imagerConfig, 'Rackspace')
        imager.remove()
      }).should.throw('Please specify a proper variant to remove the files')
    })

    it('should not throw if callback is not provided', function () {
      (function () {
        var imager = new Imager(imagerConfig, 'Rackspace')
        imager.remove([], 'items')
      }).should.not.throw()
    })

    it('should throw if the variant is not in the config', function () {
      (function () {
        var imager = new Imager(imagerConfig, 'Rackspace')
        imager.remove([], 'abc')
      }).should.throw('Please provide a variant which you have specified in the config file')
    })

    it('should do nothing if the files are not provided', function (done) {
      var imager = new Imager(imagerConfig, 'Rackspace')
      imager.remove([], function (err) {
        should.not.exist(err)
        done()
      }, 'items')
    })

    it('should accept string as a file to remove', function () {
      (function () {
        var imager = new Imager(imagerConfig, 'Rackspace')
        imager.remove('123.jpg', 'items')
      }).should.not.throw()
    })

    describe('With a file that does not exist in the cloud', function () {
      it('should not throw', function () {
        (function () {
          var imager = new Imager(imagerConfig, 'Rackspace')
          imager.remove(['111.jpg'], 'items')
        }).should.not.throw()
      })
    })

    describe('With a file that exists in the cloud', function () {
      it('should remove the files successfully', function () {
        var imager = new Imager(imagerConfig, 'Rackspace')
        // uncomment the below and make sure 123.jpg already exists

        /*
        imager.remove(['123.jpg'], function (err) {
          should.not.exist(err)
          done()
        }, 'items')
        */
      })
    })
  })
})


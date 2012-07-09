var formidable = require('formidable')
  , util = require('util')
  , im = require('imagemagick')
  , fs = require('fs')
  , path = require('path')
  , mime = require('mime')
  , cloudfiles = require('cloudfiles')
  , http  = require('http')
  , url   = require('url')

var config_file = '../imager-example.json'
  , config = {}
  , client = undefined
  , container = undefined
  , uploaddir = undefined
  , storage_type = undefined
  , scope = undefined
  , cdnUri = undefined
  , uploadedFiles = []


var Imager = exports = module.exports = function Imager(options) {
  config_file = (typeof options['config_file'] === 'undefined') ? config_file : options['config_file']
  storage_type = options['storage']
  this.loadConfig(config_file)
  this.localFiles = false

  // throw an error if the rackspace auth settings are not defined
  if ( typeof (config['storage']['rs']) == 'undefined' )
    throw new TypeError("No storage defined in Imager config")

  for(storage in config['storage']) {
    this[storage + 'Setup'](config['storage'][storage])
  }
}


Imager.prototype = {

    url: function(file, version, callback) {
      var _file = this.genFileName( file, version )
      return this[storage_type + 'Url'](_file, callback)
    }

  , rsUrl: function(file, callback) {
      // authenticate your rackspace account
      client.setAuth(function() {
        // get the container
        client.getContainer(container, true, function (err, c) {
          // if there is any error, pass the error to the callback
          if (err) callback(err)
          // pass the url to the callback
          callback(null, c.cdnUri+'/'+file)
        })
      })
    }

  , genFileName: function(file, version) {
      return version + '_' + file
    }

  , remove: function(files, callback, _scope) {
      scope = (arguments.length == 3) ? _scope : undefined
      var self = this

      if (typeof(files) === 'string') {
        // remove the single file
        removeVariants(files)
      }
      else if (Array.isArray(files)) {
        // remove all the files in the given array
        try {
          files.forEach(function (file) {
            removeVariants(file)
          })
        }
        catch (e) {
          callback(e)
        }
      }
      else {
        // throw an error
        callback(new Error('You should pass a single file or an array of files'))
      }

      function removeVariants (file) {
        var _variants = self.setupVariants()
          , _resize = _variants['resize']
          , _crop = _variants['crop']

        // remove each variant specified in the resize settings
        for(version in _resize) {
          self[storage_type + 'Remove']( self.genFileName( file, version ),  function(err) {
            if (err) return callback(err)
          })
        }

        // remove each variant specified in the crop settings
        for(version in _crop) {
          self[storage_type + 'Remove']( self.genFileName( file, version ),  function(err) {
            if(err) return callback(err)
          })
        }
      }

      callback(null)
    }

  , rsRemove: function(file, callback) {
      // authenticate your rackspace account
      client.setAuth(function() {
        // get the container
        client.getContainer(container, true, function (err, c) {
          if (err) return callback(err)
          // remove the file from container
          c.removeFile(file, function(err){
            if (err) console.log(err)
            console.log('removed')
          })
        })
      })
    }

  , upload: function(req, callback, _scope) {
      var _this = this
        , files = []
      // allow passing of a single file OR an array of files
      if (typeof req === 'string' || Array.isArray(req)) {
        this.localFiles = true
        scope = (arguments.length == 3) ? _scope : undefined
        // create the files array.
        files = typeof req === 'string' ? req.split() : req
        parsedForm(files)
      }
      else {
        scope = (arguments.length == 3) ? _scope : undefined
        var _this = this
          , form = new formidable.IncomingForm()
          , files = []
          , new_file = undefined

        if (req.files == undefined) {
          // parse the form if it isn't parsed yet
          form.parse(req, function (err, fields, files) {
            parsedForm(files)
          })
        }
        else {
          // send the files for processing
          parsedForm(req.files)
        }
      }

      function parsedForm (files) {

        var keys = Object.keys(files)
          , k = keys.shift()

        // if files are uploaded with multiple attr
        if (Array.isArray(files[k])) {
          files = files[k]
          keys = Object.keys(files)
          k = keys.shift()
        }

        processImage(files[k])

        function processImage(file) {
          if (file.name != '' || this.localFiles) {
            _this.makeVariants(file, function(err, file){
              var key = keys.shift()
              if (typeof key != 'undefined')
                processImage(files[key])
              else {
                callback(err, uploadedFiles, cdnUri)
                uploadedFiles = []
              }
            })
          }
          else {
            var key = keys.shift()
            if (typeof key != 'undefined')
              processImage(files[key])
            else {
              callback(null, uploadedFiles, cdnUri)
              uploadedFiles = []
            }
          }
        }
      }

    }

  , rsSetup: function(options) {
      client = cloudfiles.createClient(options)
      container = options.container
    }

  , makeVariants: function(file, callback) {
      var _this = this
        , _variants = this.setupVariants()
        , _resize = _variants["resize"] || JSON.parse( JSON.stringify({"null" : "null"}) )
        , _crop = _variants["crop"] || JSON.parse( JSON.stringify({"null" : "null"}) )
        , new_file = Math.round(new Date().getTime())
        , type = this.localFiles ? mime.lookup(file) : file['type']
        , filePath = this.localFiles ? file : file['path']
        , ext = this.setExtension(type)

      new_file += ext
      uploadedFiles.push(new_file)


      if (Object.keys(_resize).length == 0 && Object.keys(_crop).length == 0)
        throw new Error("No variants specified in the config file")
      else if (Object.keys(_resize).length > 0 && Object.keys(_crop).length > 0) {
        resizeImage(function () {
          cropImage()
        })
      }
      else if (Object.keys(_resize).length > 0 && Object.keys(_crop).length == 0)
        resizeImage()
      else
        cropImage()


      function resizeImage(cb) {
        if (Object.keys(_resize).length > 0) {

          var keys = Object.keys(_resize)
            , k = keys.shift()

          Resize(_resize[k], k)

          function Resize(preset, prefix) {
            _this.imAction('im.resize', file, _this.genFileName( new_file, prefix ) , preset, function(err){
              if (err) return callback(err)
              var key = keys.shift()

              if (key) Resize(_resize[key], key)
              else if (!key && Object.keys(_crop).length > 0) cb()
              else callback(err, new_file)
            })
          }
        }
      }

      function cropImage(cb) {
        if (Object.keys(_crop).length > 0) {

          var keys = Object.keys(_crop)
            , k = keys.shift()

          Crop(_crop[k], k)

          function Crop(preset, prefix) {
            _this.imAction('im.crop', file, _this.genFileName( new_file, prefix ) , preset, function(err){
              if (err) return callback(err)
              var key = keys.shift()

              if (key) Crop(_crop[key], key)
              else callback(err, new_file)
            })
          }
        }
      }
    }

  , setupVariants: function() {
      var resize = (typeof scope === 'undefined') ? config.variants.resize : config.variants[scope].resize
        , crop = (typeof scope === 'undefined') ? config.variants.crop : config.variants[scope].crop
      return { "resize" : resize, "crop" : crop }
    }

  , pushToRS: function(sfile, dfile, content_type, callback) {

      fs.readFile(sfile, function (err, buf) {
        if (err) return callback(err)

        client.setAuth(function() {
          client.getContainer(container, true, addFileToContainer)
        })

        function addFileToContainer(err, c) {
          if (err) callback(err)
          var options = {
              remote: dfile
            , headers: {
                  'Content-Type': content_type
                , 'Content-Length': buf.length
              }
            , local: sfile }

          cdnUri = c.cdnUri
          client.addFile(container, options, onUploadToContainer)
        }

        function onUploadToContainer(err, uploaded) {
          if (err) return callback(err)
          console.log('uploaded')
          if (uploaded) callback(err)
        }
      })
    }

  , loadConfig: function(resource) {
      if (fs.existsSync(resource)) {
        try {
          config = JSON.parse(fs.readFileSync(resource))
        } catch (err) {
          throw new Error("Could not parse JSON config at "+path.resolve(resource))
        }
      }
    }

  , imAction: function(action, file, prefix, size, callback) {
      if (size == "null") {
        return callback(null)
      }

      var _this = this
        , dfile = prefix
        , filePath = this.localFiles ? file.split('/').slice(0, -1).join('/')+'/' : file['path']
        , type = this.localFiles ? mime.lookup(file) : file['type']
        , tfile = (storage_type == 'dir') ?  uploaddir + dfile : filePath + prefix

      eval(action)( this.imOptions(file, tfile, size), function(err, stdout, stderr){
        if (err) return callback(err)
        if (storage_type == 'rs') {
          _this.pushToRS(tfile, dfile, type, function(err){
            return callback(err)
          })
        }
        else
          return callback(err)
      })
    }

  , setExtension: function(content_type) {

      switch(content_type) {
        case 'image/jpeg':
          var ext = '.jpg'
          break
        case 'image/png':
          var ext = '.png'
          break
        case 'image/gif':
          var ext = '.gif'
          break
      }
      return ext
    }

  , imOptions: function(file, tfile, size) {
      var _size = size.split('x')
        , filePath = this.localFiles ? file : file['path']

      return options = {
        srcPath: filePath,
        dstPath: tfile,
        width: _size[0],
        height: _size[1],
        quality: 1
      }
    }

  , fetchImage:  function (remoteImageUrl, callback) {
      var remote = url.parse(remoteImageUrl)
        , file = url.parse(remoteImageUrl).pathname.split("/").pop()
        , self = this
        , image = '/tmp/'+file

      http.get(remote, function (res) {
        var fstr = fs.createWriteStream(image)
        res.pipe(fstr)
        callback(image)
      })
    }

  , uploadRemoteImage: function(remoteImageUrl, callback, scope) {
      var self = this

      this.fetchImage(remoteImageUrl, function (image) {
        self.upload(image, function (err, files, cdnUri){
          if (err) return callback(err)
          callback(null, files, cdnUri)
        }, scope)
      })
    }
}

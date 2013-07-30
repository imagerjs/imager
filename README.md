[![Build Status](https://travis-ci.org/madhums/node-imager.png)](https://travis-ci.org/madhums/node-imager)

## Imager

A node module to resize, crop and upload images (with different variants and presets) to Rackspace cloudfiles and Amazon S3.

## Installation
```sh
$ npm install imager
```

## Usage
**You need to create imager configuration file with image variants and your storages**

Checkout the example config file `imager-example.js` in the repo

```js
var Imager = require('imager');
    // See https://github.com/madhums/node-imager/blob/master/imager-example.js for example configuration
  , imagerConfig = require('path/to/imager-config.js')
  , imager = new Imager(imagerConfig, 'Rackspace') // or 'S3' for amazon
```

### Uploading file(s)

The callback recieves an err object, a files array (containing the names of the files which were
uploaded) and the cdnUri.

So if you have a variant, say `thumb`, then you can access the image by `cdnUri+'/'+'thumb_'+files[0]`. This would be the complete url of the image

1. **Form upload (multiple images)**

  If you are using express, you will recieve all the form files in `req.files`.

  ```js
  imager.upload([req.files.image], function(err, cdnUri, files) {
      // do your stuff
  }, 'projects')
  ```

  Here, `projects` is your scope or variant. If you don't specify the scope or the variant, imager
  will try to look for a default variant named `default`. You must either specify a variant like
  above or provide a `default` variant.

  ONLY WORKS WITH S3
  If you add an uploadDirectory field to the imager config file as shown in imager-example.js, the files uploaded will go into that specific folder rather than the root of the bucket.
  If you leave out the uploadDirectory field, uploads will default to the root of the bucket.

2. **Upload local images**

  ```js
  imager.upload(['/path/to/file'], function (err, cdnUri, files) {
    // do your stuff
  }, 'projects')
  ```

  Here files can be an array or a string. Make sure the path is
  absolute.

### Removing file(s)

1. **Remove from cloudfiles**

  ```js
  var files = ['1330838831049.png', '1330838831049.png']
  imager.remove(files, function (err) {
      // do your stuff
  }, 'projects')
  ```

  `files` can be array of filenames or a string of single filename.

  Even here, if the variant is not specified, imager will try to look for the `default` variant. If neither
  of them are provided, you will get an error.


If you specify `debug: true` in the imager config, you can see the logs of uploaded / removed files.

## Tests

```sh
$ npm test
```

## License
(The MIT License)

Copyright (c) 2012 Madhusudhan Srinivasa < [madhums8@gmail.com](mailto:madhums8@gmail.com) >

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

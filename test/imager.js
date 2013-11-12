
module.exports = {
  variants: {
    items: {
      resize: {
        mini : "300x200",
        preview: "800x600"
      },
      crop: {
        thumb: "200x200"
      },
      resizeAndCrop: {
        large: {resize: "1000x1000", crop: "900x900"}
      }
    },

    gallery: {
      crop: {
        thumb: "100x100"
      }
    }
  },

  storage: {
    Local: {
      path: '/tmp',
      mode: 0777
    },
    Rackspace: {
      username: "USERNAME",
      apiKey: "API_KEY",
      authUrl: "https://lon.auth.api.rackspacecloud.com",
      container: "CONTAINER_NAME"
    }
  },

  debug: false
}

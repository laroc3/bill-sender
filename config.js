// Edit CLIENT_ID after creating your Google OAuth client (see SETUP.md, step 3).
window.APP_CONFIG = {
  CLIENT_ID: "133794128566-d0gin5e2bb017j1dc4blql6ji85nret0.apps.googleusercontent.com",
  FROM: "bishnupriyac96@gmail.com",
  TO: "bishnupriya.chakrabarti@in.ey.com",
  // Max size of each zip in bytes. Email adds ~37% (base64 + line breaks),
  // so 7,000,000 -> ~9.6 MB on the wire, safely under the 10 MB inbox limit.
  MAX_ZIP_BYTES: 7000000
};

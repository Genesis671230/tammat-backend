const sgMail = require("@sendgrid/mail");
const dotenv = require("dotenv");
dotenv.config();
const sendGridApiKey = process.env.SENDGRID_API_KEY;

sgMail.setApiKey(`${sendGridApiKey}`);

// const msg = {
//   to: 'reignrealestatead@gmail.com',
//   from: 'synapses1230975@gmail.com', // Use the email address or domain you verified above
//   subject: 'Lead Created',
//   text: 'A lead has been created kindly check the dashboard',
//   html: '<strong>and easy to do anywhere, even with Node.js</strong>',
      // template_id: "d-08bbcfc4d1cd4b859f024e391434979a"
// };

const sendMail = (msg) => {
  return sgMail
    .send(msg)
    .then((response) => {
      console.log(response[0].statusCode);
      console.log(response[0].headers);
      console.log(response[0].body),"sendMail body: ";
      return response[0];
    })
    .catch((error) => {
      console.error("catch error: ", error?.response?.body);
    });
};

module.exports = { sendMail };

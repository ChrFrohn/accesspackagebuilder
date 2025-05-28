var express = require("express");
var router = express.Router();
const insightsClient = require("../appInsightsClient");

// GET home page
router.get("/", (req, res, next) => {
  // Check if the user is logged in (i.e., if there's a token in the session)
  if (req.session.token) {
    // If the user is already logged in, redirect them to the success page
    res.redirect("/success"); // Automatically redirect to the success page after login
  } else {
    if (insightsClient) {
      insightsClient.trackEvent({
        name: "LandingPageVisited",
        properties: { page: req.originalUrl }
      });
    }   
    res.render("index", { title: "Access Package Builder" }); // Render your home page view or login page
  }
});

module.exports = router;

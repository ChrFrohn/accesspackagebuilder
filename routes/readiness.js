var express = require("express");
var router = express.Router();
const insightsClient = require("../appInsightsClient");

// GET home page
router.get("/", (req, res, next) => {

  if (req.session.token) {

    res.redirect("/success"); 

  } else {
    if (insightsClient) {
      insightsClient.trackEvent({
        name: "ReadinessPageVisited",
        properties: { page: req.originalUrl }
      });
    }   
    res.render("readiness", { title: "Access Package Builder" }); 
  }
});

module.exports = router;

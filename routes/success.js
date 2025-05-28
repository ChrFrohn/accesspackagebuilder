const express = require("express");
const router = express.Router();
const { getUserInfo } = require("../auth"); // Import functions from core auth.js
const insightsClient = require("../appInsightsClient");
const crypto = require('crypto');

// Route to handle the success page after login
router.get('/success', async (req, res) => {
  if (!req.session.token || !req.session.tenantId) {
    console.error('Access token or tenant ID not found in session');
    return res.redirect('/'); // Redirect to home if session data is missing
  }

  const accessToken = req.session.token;

  try {
    
    if (insightsClient && req.session.tenantId && req.session.userPrincipalName) {
      const hashedId = crypto
        .createHash('sha256')
        .update(req.session.tenantId + ':' + req.session.userPrincipalName)
        .digest('hex');
    
      insightsClient.setAuthenticatedUserContext(hashedId);
      insightsClient.trackEvent({
        name: "SuccessPageVisited",
        properties: { page: req.originalUrl }
      });
    } 
    // Fetch user list using the access token
    const users = await getUserInfo(accessToken);
    const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;

    res.render('success', {
      tenantId: req.session.tenantId,
      displayName: req.session.displayName,
      userPrincipalName: req.session.userPrincipalName,
      connectionString: connectionString // Pass the connectionString to the EJS view
    });
  } catch (error) {
    console.error('Error fetching users list:', error); // Debugging statement
    res.status(500).send('Error fetching users list');
  }
});

module.exports = router;

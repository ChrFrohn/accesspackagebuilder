const express = require("express");
const router = express.Router();
const { getUserInfo } = require("../auth"); // Import functions from core auth.js


// Route to handle the success page after login
router.get('/', async (req, res) => {
  if (!req.session.token || !req.session.tenantId) {
    console.error('Access token or tenant ID not found in session');
    return res.redirect('/'); // Redirect to home if session data is missing
  }

  const accessToken = req.session.token;

  try {
    // Fetch user list using the access token
    const users = await getUserInfo(accessToken);
    
    res.render('nextSteps', {
      tenantId: req.session.tenantId,
      displayName: req.session.displayName,
      userPrincipalName: req.session.userPrincipalName, // Pass the username to the view
    });
  } catch (error) {
    console.error('Error fetching users list:', error); // Debugging statement
    res.status(500).send('Error fetching users list');
  }
});

module.exports = router;

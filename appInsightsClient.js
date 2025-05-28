// appInsightsClient.js
const appInsights = require("applicationinsights");

let insightsClient = null;

if (process.env.NODE_ENV === "production" && process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  appInsights.setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .setAutoDependencyCorrelation(true)
    .setAutoCollectConsole(true, true)
    .start();

  insightsClient = appInsights.defaultClient;
  console.log("✅ Application Insights initialized in production mode");
} else {
  console.log("⚠️ Application Insights disabled (not in production or missing connection string)");
}

module.exports = insightsClient;

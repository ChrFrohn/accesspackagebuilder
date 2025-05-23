require("dotenv").config({ path: "./.env" });
const msal = require("@azure/msal-node");
const axios = require("axios");
const hljs = require("highlight.js");

// Configuration for MSAL (Use environment variables)
const msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: "https://login.microsoftonline.com/common",
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  },
};

// Initialize Confidential Client Application
const pca = new msal.ConfidentialClientApplication(msalConfig);

// Define required scopes
const requiredScopes = [
  "User.Read.All",
  "Directory.Read.All",
  "Group.Read.All",
];

// Function to generate Authorization URL
const getAuthUrl = async (forceConsent = false) => {
  try {
    const redirectUri = process.env.HOST
      ? `${process.env.HOST}/auth/redirect`
      : "http://localhost:3000/auth/redirect"; // Fallback to local URL

    let authParams = {
      scopes: requiredScopes,
      redirectUri,
    };

    // If forceConsent is true, add prompt=consent
    if (forceConsent) {
      authParams.prompt = "consent";
    }

    const authUrl = await pca.getAuthCodeUrl(authParams);
    return authUrl;
  } catch (error) {
    console.error("Error generating auth URL:", error);
    throw new Error("Failed to generate authentication URL.");
  }
};

// Function to acquire token using Authorization Code
const getToken = async (code) => {
  try {
    const redirectUri = process.env.HOST
      ? `${process.env.HOST}/auth/redirect`
      : "http://localhost:3000/auth/redirect"; // Fallback to local URL

    const tokenRequest = {
      code: code,
      scopes: requiredScopes,
      redirectUri,
    };

    const response = await pca.acquireTokenByCode(tokenRequest);
    return response;
  } catch (error) {
    console.error("Error acquiring token:", error);
    throw new Error("Failed to acquire token.");
  }
};

// Function to check if user needs re-consent (403 Forbidden = Missing Permissions)
const checkUserPermissions = async (accessToken) => {
  try {
    await axios.get("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return false; // No error = No need for consent
  } catch (error) {
    if (error.response && error.response.status === 403) {
      console.log("User lacks required permissions, forcing consent...");
      return true;
    }
    console.error("Error checking user permissions:", error);
    throw new Error("Failed to verify user permissions.");
  }
};

const getUserInfo = async (accessToken) => {
  const graphUrl = "https://graph.microsoft.com/v1.0/me";

  const response = await axios.get(graphUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.data;
};

const getUsersList = async (accessToken) => {
  let users = [];
  let nextLink = "https://graph.microsoft.com/v1.0/users";

  try {
    while (nextLink) {
      // Make the request to the Graph API, including the $select only in the first request
      const response = await axios.get(nextLink, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params:
          nextLink === "https://graph.microsoft.com/v1.0/users"
            ? {
                $select:
                  "id,AccountEnabled,userType,displayName,jobTitle,department,officeLocation,country,companyName,city,streetAddress,state",
              }
            : {}, // Only add $select for the first request
      });

      users = users.concat(response.data.value);
      nextLink = response.data["@odata.nextLink"] || null;
    }
    return users;
  } catch (error) {
    console.error(
      "Error making Graph API call:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
};

// Function to fetch groups of a user (with pagination)
async function getUserGroups(userId, accessToken) {
  let groups = [];
  let nextLink = `https://graph.microsoft.com/v1.0/users/${userId}/memberOf`;
  const headers = { Authorization: `Bearer ${accessToken}` };
  try {
    while (nextLink) {
      const response = await axios.get(nextLink, { headers });
      groups = groups.concat(response.data.value);
      nextLink = response.data["@odata.nextLink"] || null;
    }

    // Return the transformed array
    return groups.map((group) => {
      let groupTypeLabel = "Unknown"; // Default label

      if (
        Array.isArray(group.groupTypes) &&
        group.groupTypes.includes("DynamicMembership")
      ) {
        groupTypeLabel = "Dynamic";
      } else if (
        Array.isArray(group.groupTypes) &&
        group.groupTypes.includes("Unified")
      ) {
        groupTypeLabel = "M365";
      } else if (group.onPremisesSyncEnabled) {
        groupTypeLabel = "On-Premise";
      } else if (group.mailEnabled && group.securityEnabled) {
        groupTypeLabel = "Mail-Security";
      } else if (group.mailEnabled && !group.securityEnabled) {
        groupTypeLabel = "Distribution List";
      } else if (!group.mailEnabled && group.securityEnabled) {
        groupTypeLabel = "Security";
      }

      return {
        id: group.id,
        displayName: group.displayName,
        type: groupTypeLabel,
      };
    });
  } catch (err) {
    console.error(`Error fetching groups for user ${userId}:`, err);
    return [];
  }
}

async function getGroupMembershipAnalyzer(groupId, accessToken) {
  let members = [];
  let nextLink = `https://graph.microsoft.com/v1.0/groups/${groupId}/members?$select=id,accountEnabled,userType,displayName,department,officeLocation,companyName,country,userPrincipalName`;

  const headers = { Authorization: `Bearer ${accessToken}` };

  try {
    while (nextLink) {
      const response = await axios.get(nextLink, { headers });

      const users = response.data.value.filter(
        (member) => member["@odata.type"] === "#microsoft.graph.user"
      );
      members = members.concat(users);

      nextLink = response.data["@odata.nextLink"] || null;
    }

    return members;
  } catch (err) {
    console.error(`Error fetching members for group ${groupId}:`, err);
    return [];
  }
}

// Main function to list users and their groups
async function listUsersAndGroups(accessToken) {
  const users = await getUsersList(accessToken);
  const userGroups = [];
  const chunkSize = 50;
  for (let i = 0; i < users.length; i += chunkSize) {
    const userChunk = users.slice(i, i + chunkSize);

    const chunkResults = await Promise.all(
      userChunk.map(async (user) => {
        const groups = await getUserGroups(user.id, accessToken);
        return {
          userId: user.id,
          userAccountEnabled: user.accountEnabled,
          userType: user.userType,
          displayName: user.displayName,
          department: user.department,
          companyName: user.companyName,
          groups: groups.map((group) => ({
            id: group.id,
            displayName: group.displayName,
            type: group.type,
          })),
        };
      })
    );

    userGroups.push(...chunkResults);
  }
  return userGroups;
}

async function getGroupListAndTotalMembers(accessToken) {
  const users = await getUsersList(accessToken);
  const groupCounts = {};

  const chunkSize = 50;
  for (let i = 0; i < users.length; i += chunkSize) {
    const userChunk = users.slice(i, i + chunkSize);

    await Promise.all(
      userChunk.map(async (user) => {
        const groups = await getUserGroups(user.id, accessToken);
        groups.forEach((group) => {
          if (groupCounts[group.id]) {
            groupCounts[group.id].count += 1;
          } else {
            groupCounts[group.id] = {
              id: group.id,
              displayName: group.displayName,
              groupType: group.type,
              count: 1,
            };
          }
        });
      })
    );
  }

  // Sort groups by count DESC (highest first)
  const sortedGroups = Object.values(groupCounts).sort(
    (a, b) => b.count - a.count
  );

  return sortedGroups;
}

async function getCompaniesAndDepartments(accessToken) {
  const users = await getUsersList(accessToken);
  const companies = new Set();
  const departments = new Set();

  users.forEach((user) => {
    if (user.companyName) {
      companies.add(user.companyName);
    }
    if (user.department) {
      departments.add(user.department);
    }
  });

  return {
    companies: Array.from(companies).sort((a, b) => a.localeCompare(b)), // Descending order
    departments: Array.from(departments).sort((a, b) => a.localeCompare(b)), // Descending order
  };
}

async function getPowerShellScript(accessToken) {
  try {
    const GITHUB_RAW_URL =
      "https://raw.githubusercontent.com/ChrFrohn/Access-Package-Builder/refs/heads/main/CreateAccessPackageFromJSON.ps1";

    // Fetch raw PowerShell script from GitHub
    const response = await axios.get(GITHUB_RAW_URL);
    const powershellCode = response.data;

    // Highlight PowerShell code
    const highlightedCode = hljs.highlight(powershellCode, {
      language: "powershell",
    }).value;

    return highlightedCode;
  } catch (error) {
    console.error("Error fetching PowerShell script:", error);
    return "Error loading script.";
  }
}

// Function to fetch Identity Governance status (with pagination for groups and devices)
async function getIdentityGovernanceStatus(accessToken) {
  const headers = { Authorization: `Bearer ${accessToken}` };

  try {
    // Fetch member and guest users
    let usersUrl = "https://graph.microsoft.com/v1.0/users";
    let usersResponse = await axios.get(usersUrl, { headers });
    let totalUsers = usersResponse.data.value;

    while (usersResponse.data["@odata.nextLink"]) {
      // Pagination for users
      usersUrl = usersResponse.data["@odata.nextLink"];
      usersResponse = await axios.get(usersUrl, { headers });
      totalUsers = totalUsers.concat(usersResponse.data.value);
    }

    const guestUsers = totalUsers.filter((user) =>
      user.userPrincipalName.includes("#EXT#")
    ).length;

    // Fetch privileged roles (not productive!!!!!!!!!!)
    let rolesUrl =
      "https://graph.microsoft.com/v1.0/roleManagement/directory/roleDefinitions";
    let rolesResponse = await axios.get(rolesUrl, { headers });
    let privilegedRoles = rolesResponse.data.value.filter((role) =>
      ["Global Administrator", "Privileged Role Administrator"].includes(
        role.displayName
      )
    ).length;

    // Fetch groups with pagination
    let groupsUrl = "https://graph.microsoft.com/v1.0/groups";
    let groupsResponse = await axios.get(groupsUrl, { headers });
    let groups = groupsResponse.data.value;

    while (groupsResponse.data["@odata.nextLink"]) {
      // Pagination for groups
      groupsUrl = groupsResponse.data["@odata.nextLink"];
      groupsResponse = await axios.get(groupsUrl, { headers });
      groups = groups.concat(groupsResponse.data.value);
    }

    // Initialize counters for groups
    const totalGroups = groups.length;
    let securityGroups = 0;
    let M365Groups = 0;
    let dynamicGroups = 0;
    let cloudGroups = 0;
    let onPremiseGroups = 0;

    // Process each group
    groups.forEach((group) => {
      if (group.securityEnabled) {
        securityGroups++;
      }
      if (group.groupTypes?.includes("Unified")) {
        M365Groups++;
      }
      if (group.groupTypes?.includes("DynamicMembership")) {
        dynamicGroups++;
      }
      if (!group.onPremisesSyncEnabled) {
        cloudGroups++;
      }
      if (group.onPremisesSyncEnabled) {
        onPremiseGroups++;
      }
    });

    // Fetch applications
    let appsUrl = "https://graph.microsoft.com/v1.0/applications";
    let appsResponse = await axios.get(appsUrl, { headers });
    let applications = appsResponse.data.value.length;

    // Fetch devices with pagination
    let deviceUrl = "https://graph.microsoft.com/v1.0/devices";
    let deviceResponse = await axios.get(deviceUrl, { headers });
    let devices = deviceResponse.data.value;

    while (deviceResponse.data["@odata.nextLink"]) {
      // Pagination for devices
      deviceUrl = deviceResponse.data["@odata.nextLink"];
      deviceResponse = await axios.get(deviceUrl, { headers });
      devices = devices.concat(deviceResponse.data.value);
    }

    const deviceCount = devices.length;

    // Return aggregated data
    return {
      totalUsers: totalUsers.length,
      guestUsers,
      totalGroups,
      securityGroups,
      M365Groups,
      dynamicGroups,
      cloudGroups,
      onPremiseGroups,
      highlyPrivilegedRoles: privilegedRoles,
      groups: groups.length,
      applications,
      deviceCount,
    };
  } catch (err) {
    console.error("Error fetching Identity Governance status:", err);
    throw err;
  }
}

module.exports = {
  getAuthUrl,
  getToken,
  getUserInfo,
  getUsersList,
  getUserGroups,
  listUsersAndGroups,
  getIdentityGovernanceStatus,
  getGroupListAndTotalMembers,
  getCompaniesAndDepartments,
  getPowerShellScript,
  getGroupMembershipAnalyzer,
  checkUserPermissions,
};

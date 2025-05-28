# Required modules
$requiredModules = @("AzTable", "Microsoft.Graph.Authentication", "Microsoft.Graph.Users")

# Function to wait for modules to be loaded
function Wait-ForModules {
    param (
        [string[]]$Modules,
        [int]$TimeoutSeconds = 60
    )
    $elapsed = 0
    $interval = 5

    while ($elapsed -lt $TimeoutSeconds) {
        $loadedModules = Get-Module -ListAvailable | Where-Object { $Modules -contains $_.Name } | Select-Object -ExpandProperty Name -Unique
        $missingModules = $Modules | Where-Object { $_ -notin $loadedModules }

        if ($missingModules.Count -eq 0) {
            Write-Host "All required modules loaded: $($Modules -join ', ')"
            return
        } else {
            Write-Host "Waiting for modules to load: $($missingModules -join ', ')"
            Start-Sleep -Seconds $interval
            $elapsed += $interval
        }
    }

    throw "Modules not loaded in time: $($missingModules -join ', ')"
}

# Wait for all modules to be loaded
Wait-ForModules -Modules $requiredModules

# Import modules
Import-Module AzTable
Import-Module Microsoft.Graph.Users
Import-Module Microsoft.Graph.Authentication 

# Log in with Managed Identity
$null = Connect-AzAccount -Identity

# Set variables
$resourceGroup = "rg-HcmProvisioning"
$storageAccountName = "sthcmprovisioning2024"
$tableName = "UserAttributesValidation"

# Get storage account and table context
$storageAccount = Get-AzStorageAccount -ResourceGroupName $resourceGroup -Name $storageAccountName
$ctx = $storageAccount.Context
$storageTable = Get-AzStorageTable -Name $tableName -Context $ctx
$cloudTable = $storageTable.CloudTable
$rows = Get-AzTableRow -Table $cloudTable

# Parse the retrieved rows and check for valid 'ValidValues'
$parsed = $rows | ForEach-Object {
    if ($_.ValidValues -ne $null) {
        [PSCustomObject]@{
            PartitionKey = $_.PartitionKey
            RowKey       = $_.RowKey
            ValidValues  = (ConvertFrom-Json $_.ValidValues)
        }
    } else {
        Write-Host "ValidValues is null for RowKey: $($_.RowKey)"
    }
}

$companyName = ($parsed | Where-Object { $_.PartitionKey -eq "CompanyName" }).ValidValues
$country = ($parsed | Where-Object { $_.PartitionKey -eq "Country" }).ValidValues
$department = ($parsed | Where-Object { $_.PartitionKey -eq "Department" }).ValidValues
$excludedUsers = ($parsed | Where-Object { $_.PartitionKey -eq "ExcludedUsers" }).ValidValues

# Log in with Managed Identity
Connect-MgGraph -Identity -NoWelcome

# Fetch users
$users = Get-MgUser -All -Property Id, AccountEnabled, createdDateTime, DisplayName, UserPrincipalName, companyName, country, department, UserType |
    Select-Object Id, AccountEnabled, createdDateTime, DisplayName, UserPrincipalName, companyName, country, department, UserType

# Exclude users where UserPrincipalName is in ExcludedUsers list or UserType is "Guest"
$filteredUsers = $users | Where-Object {
    $excludedUsers -notcontains $_.UserPrincipalName -and $_.UserType -ne "Guest" -and $_.AccountEnabled -eq "True"
}

$mismatchReport = @()

foreach ($user in $filteredUsers) {
    $invalidCompanyName = if (-not $user.companyName) {
        "EMPTY"
    } elseif ($companyName -notcontains $user.companyName) {
        $user.companyName
    } else {
        ""
    }

    $invalidCountry = if (-not $user.country) {
        "EMPTY"
    } elseif ($country -notcontains $user.country) {
        $user.country
    } else {
        ""
    }

    $invalidDepartment = if (-not $user.department) {
        "EMPTY"
    } elseif ($department -notcontains $user.department) {
        $user.department
    } else {
        ""
    }

    if ($invalidCompanyName -or $invalidCountry -or $invalidDepartment) {
        $mismatchedAttributes = @()
        if ($invalidCompanyName) { $mismatchedAttributes += "CompanyName" }
        if ($invalidCountry)     { $mismatchedAttributes += "Country" }
        if ($invalidDepartment)  { $mismatchedAttributes += "Department" }

        $mismatchReport += [PSCustomObject]@{
            UserCreatedDateTime   = $user.createdDateTime.ToString("dd.MM.yyyy HH:mm:ss")
            DisplayName           = $user.DisplayName
            UserPrincipalName     = $user.UserPrincipalName
            MismatchedAttributes  = $mismatchedAttributes -join ", "
            InvalidCompanyName    = $invalidCompanyName
            InvalidCountry        = $invalidCountry
            InvalidDepartment     = $invalidDepartment
        }
    }
}

# Convert $mismatchReport to JSON
$mismatchReportJson = $mismatchReport | ConvertTo-Json -Depth 3
Write-Output $mismatchReportJson
#!/bin/bash

# Script to update IAM policy for GitHub Actions deployment user
# This script updates the existing IAM user policy with the corrected permissions

set -e

# Configuration
IAM_USER_NAME="github-actions-vts-deploy"
POLICY_NAME="GitHubActionsVTSDeployPolicy"
POLICY_FILE="cdk-deploy-policy.json"

echo "📋 Updating IAM Policy for GitHub Actions deployment..."

# Check if policy file exists
if [ ! -f "$POLICY_FILE" ]; then
    echo "❌ Error: Policy file $POLICY_FILE not found"
    exit 1
fi

# Get the existing policy ARN if it exists
EXISTING_POLICY_ARN=$(aws iam list-attached-user-policies --user-name "$IAM_USER_NAME" \
    --query "AttachedPolicies[?PolicyName=='$POLICY_NAME'].PolicyArn" \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_POLICY_ARN" ]; then
    echo "📋 Found existing policy: $EXISTING_POLICY_ARN"
    
    # Create a new version of the policy
    echo "🔄 Creating new policy version..."
    aws iam create-policy-version \
        --policy-arn "$EXISTING_POLICY_ARN" \
        --policy-document file://"$POLICY_FILE" \
        --set-as-default
    
    echo "✅ Policy version updated successfully"
else
    echo "📋 Creating new IAM policy..."
    
    # Create new policy
    POLICY_ARN=$(aws iam create-policy \
        --policy-name "$POLICY_NAME" \
        --policy-document file://"$POLICY_FILE" \
        --query 'Policy.Arn' \
        --output text)
    
    echo "✅ Policy created: $POLICY_ARN"
    
    # Attach policy to user
    echo "🔗 Attaching policy to user $IAM_USER_NAME..."
    aws iam attach-user-policy \
        --user-name "$IAM_USER_NAME" \
        --policy-arn "$POLICY_ARN"
    
    echo "✅ Policy attached successfully"
fi

# Verify the attachment
echo ""
echo "📋 Verifying policy attachment..."
aws iam list-attached-user-policies --user-name "$IAM_USER_NAME" \
    --query "AttachedPolicies[?contains(PolicyName, 'VTS')].PolicyName" \
    --output table

echo ""
echo "✅ IAM policy update completed successfully!"
echo ""
echo "📝 Next steps:"
echo "1. Push changes to GitHub to trigger the deployment workflow"
echo "2. Monitor the GitHub Actions workflow for successful completion"
echo "3. If you encounter any issues, check the policy permissions in cdk-deploy-policy.json"
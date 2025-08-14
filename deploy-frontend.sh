#!/bin/bash

# Deploy frontend to AWS S3 and CloudFront

set -e

echo "🚀 Starting frontend deployment..."

# Get the S3 bucket name from CloudFormation outputs
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name VtsInfrastructureStack \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" \
  --output text)

# Get the CloudFront distribution ID
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name VtsInfrastructureStack \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" \
  --output text)

# Get the CloudFront URL
CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
  --stack-name VtsInfrastructureStack \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue" \
  --output text)

if [ -z "$BUCKET_NAME" ]; then
  echo "❌ Error: Could not find S3 bucket name. Make sure the stack is deployed."
  exit 1
fi

echo "📦 Building frontend..."
cd frontend
npm run build

echo "📤 Uploading to S3 bucket: $BUCKET_NAME"
aws s3 sync dist/ s3://$BUCKET_NAME --delete

echo "🔄 Invalidating CloudFront cache..."
if [ ! -z "$DISTRIBUTION_ID" ]; then
  aws cloudfront create-invalidation \
    --distribution-id $DISTRIBUTION_ID \
    --paths "/*"
  echo "✅ CloudFront cache invalidated"
fi

echo "✨ Deployment complete!"
echo "🌐 Your application is available at: $CLOUDFRONT_URL"
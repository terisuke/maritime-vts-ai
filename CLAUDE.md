# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI海上管制官サポートシステム (Maritime VTS AI Support System) - An AI-powered system to support Vessel Traffic Service operators through real-time VHF radio transcription and intelligent response generation.

## Key Commands

### Development Setup
```bash
# Install all dependencies across the project
npm run install:all

# AWS CDK bootstrap (one-time setup)
npm run cdk:bootstrap

# Deploy infrastructure
npm run cdk:deploy

# Destroy infrastructure (cleanup)
npm run cdk:destroy
```

### Infrastructure Development
```bash
cd infrastructure/
npm run build    # Compile TypeScript
npm run watch    # Watch mode
npm run test     # Run tests
npm run synth    # Generate CloudFormation templates
```

### Backend Development
```bash
npm run backend:test    # Run backend tests (from root)
```

### Frontend Development
```bash
npm run frontend:dev    # Start development server (from root)
npm run frontend:build  # Production build (from root)
```

## Architecture Overview

### Tech Stack
- **Infrastructure**: AWS CDK v2 (TypeScript)
- **Runtime**: Node.js 20+, TypeScript
- **Cloud**: AWS (ap-northeast-1 region)
- **Core Services**: 
  - Amazon Transcribe (speech-to-text with Japanese support)
  - Amazon Bedrock (Claude 3 Sonnet for NLP)
  - WebRTC + Kinesis Video Streams (real-time audio)
  - Lambda + API Gateway (serverless backend)
  - DynamoDB & Timestream (data storage)

### Project Structure
```
/
├── infrastructure/       # AWS CDK infrastructure definitions
│   └── lib/
│       ├── vts-infrastructure-stack.ts    # Main AWS resources
│       └── oidc-provider-stack.ts         # GitHub Actions OIDC
├── backend/             # Lambda functions (placeholder - needs implementation)
├── frontend/            # Web application (placeholder - needs implementation)
└── .github/workflows/   # CI/CD with GitHub Actions
```

### Key Infrastructure Components

**Data Storage:**
- DynamoDB table: `vts-conversations` (conversation management)
- Timestream database: `vts-maritime-logs` (time-series VHF logs)
- S3 bucket: Audio file storage with 30-day lifecycle

**Lambda Functions (need implementation):**
- `vts-webrtc-signaling`: WebRTC signaling handler
- `vts-transcription-processor`: Process Transcribe results
- `vts-nlp-processor`: Bedrock AI integration

**API:**
- WebSocket API via API Gateway v2 for real-time communication

## Development Guidelines

### Working with AWS CDK
- All infrastructure changes should be made in `infrastructure/lib/`
- Run `npm run synth` to validate CloudFormation generation before deploying
- Use `cdk diff` to preview changes before deployment

### Lambda Function Development
- Functions are defined in infrastructure but implementation goes in `backend/`
- Each function should have its own directory under `backend/src/`
- Use AWS SDK v3 for all AWS service interactions

### Environment Configuration
- Copy `.env.example` to `.env` for local development
- GitHub Actions uses OIDC for AWS authentication (no AWS keys in secrets)
- Default region: `ap-northeast-1` (Tokyo)

### Testing Approach
- Infrastructure tests: Jest in `infrastructure/test/`
- Backend tests: Should be added under `backend/test/`
- Frontend tests: Should follow React/TypeScript testing patterns

## Important Notes

1. **Language Processing**: System is configured for Japanese (`ja-JP`) - Transcribe and NLP models are optimized for Japanese maritime communications

2. **Security**: 
   - OIDC authentication between GitHub and AWS
   - Least-privilege IAM policies for all Lambda functions
   - S3 bucket encryption and DynamoDB point-in-time recovery enabled

3. **Current Status**: Infrastructure is fully defined but Lambda function implementations and frontend UI are placeholders requiring development

4. **Deployment**: GitHub Actions automatically deploys on push to main branch after OIDC setup

5. **Phase-based Development**:
   - Phase 1: Audio pipeline and transcription
   - Phase 2: Custom vocabulary and AIS integration
   - Phase 3: Automated responses with safety verification
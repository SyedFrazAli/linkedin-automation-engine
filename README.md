# LinkedIn Automation Engine

**Self-hosted automation system for LinkedIn post generation and publishing using free APIs.**

## Overview

This automation engine monitors your GitHub activity and automatically generates LinkedIn posts about your work. Built with a modular architecture, it transforms GitHub signals into professional LinkedIn content using AI.

### Key Features

- 🤖 **Fully Automated**: Scheduled GitHub monitoring → Content generation → LinkedIn publishing
- 🆓 **100% Free APIs**: HuggingFace (LLM), Unsplash/Pexels (images), GitHub/LinkedIn APIs
- 🎯 **Queue-First Design**: Manual review before posting (recommended) or auto-publish
- 📊 **Modular Pipeline**: Easy to extend, customize, and debug
- 🔐 **Self-Hosted**: Full control over your data and credentials

## How It Works

```
GitHub Activity → Signal Detection → Classification → Context Fetching
    ↓
Data Normalization → Prompt Building → LLM Generation → Image Generation
    ↓
LinkedIn Queue → Manual Review → Publishing
```

## Project Structure

```
linkedin-automation-engine/
├── index.js                 # Entry point (scheduler/workflow modes)
├── package.json
├── .env.example            # Configuration template
├── .gitignore
├── scheduler/
│   └── cronScheduler.js    # Cron-based task scheduling
├── workflows/
│   └── workflowEngine.js   # Complete automation orchestration
├── triggers/
│   ├── githubTrigger.js    # GitHub API signal detection
│   └── signalClassifier.js # Signal filtering & categorization
├── services/
│   ├── dataFetcher.js      # Wikipedia context fetching
│   ├── dataNormalizer.js   # Data transformation
│   ├── promptBuilder.js    # LLM prompt construction
│   ├── contentGenerator.js # HuggingFace text generation
│   ├── imagePromptGenerator.js # Image generation/retrieval
│   └── linkedinPublisher.js    # LinkedIn posting
└── utils/
    ├── logger.js           # Structured logging
    └── stateStore.js       # State management & deduplication
```

## Installation

### Prerequisites

- Node.js 18+ and npm
- GitHub account & Personal Access Token
- (Optional) HuggingFace API key for AI generation
- (Optional) Unsplash/Pexels API keys for stock images
- (Optional) LinkedIn OAuth token for auto-publishing

### Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/SyedFrazAli/linkedin-automation-engine.git
   cd linkedin-automation-engine
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   nano .env  # Edit with your credentials
   ```

4. **Required configuration** (minimum):
   ```env
   GITHUB_TOKEN=your_github_token
   GITHUB_USERNAME=your_username
   ```

5. **Optional enhancements**:
   ```env
   HUGGINGFACE_TOKEN=your_hf_token       # For AI text generation
   UNSPLASH_ACCESS_KEY=your_key          # For stock images
   PEXELS_API_KEY=your_key               # Alternative image source
   LINKEDIN_ACCESS_TOKEN=your_token      # For auto-publishing
   LINKEDIN_PERSON_URN=urn:li:person:XXX # Your LinkedIn URN
   LINKEDIN_AUTO_PUBLISH=false           # Recommended: false
   ```

## Usage

### Manual Workflow Execution

Run the workflow once to test:

```bash
node index.js workflow
```

This will:
1. Check GitHub for new activity
2. Generate LinkedIn post content
3. Queue posts for review (or auto-publish if configured)

### Automated Scheduling

Run the scheduler for continuous monitoring:

```bash
node index.js scheduler
```

Default schedule: Every 6 hours (configurable in `.env`):

```env
CRON_SCHEDULE=0 */6 * * *  # Every 6 hours
```

### Production Deployment

Use a process manager like PM2:

```bash
npm install -g pm2
pm2 start index.js --name linkedin-automation -- scheduler
pm2 logs linkedin-automation  # View logs
pm2 save                      # Save configuration
```

## API Keys Setup

### GitHub Personal Access Token

1. Go to [GitHub Settings → Tokens](https://github.com/settings/tokens)
2. Generate new token (classic)
3. Required scopes: `repo`, `read:user`
4. Copy token to `.env` as `GITHUB_TOKEN`

### HuggingFace API Token (Optional)

1. Sign up at [HuggingFace](https://huggingface.co/)
2. Go to [Settings → Access Tokens](https://huggingface.co/settings/tokens)
3. Create new token
4. Copy to `.env` as `HUGGINGFACE_TOKEN`

**Note**: If not provided, system uses fallback template generation.

### Image APIs (Optional)

**Unsplash** (50 requests/hour free):
1. Sign up at [Unsplash Developers](https://unsplash.com/developers)
2. Create new application
3. Copy Access Key to `.env` as `UNSPLASH_ACCESS_KEY`

**Pexels** (200 requests/hour free):
1. Sign up at [Pexels API](https://www.pexels.com/api/)
2. Get API key
3. Copy to `.env` as `PEXELS_API_KEY`

### LinkedIn OAuth Token (Optional)

**⚠️ Complex Setup - Manual Publishing Recommended**

1. Create LinkedIn app at [LinkedIn Developers](https://www.linkedin.com/developers/apps)
2. Request `w_member_social` scope
3. Complete OAuth2 flow to get access token
4. Find your Person URN by calling `/me` endpoint
5. Add to `.env`:
   ```env
   LINKEDIN_ACCESS_TOKEN=your_token
   LINKEDIN_PERSON_URN=urn:li:person:XXXXXXXX
   LINKEDIN_AUTO_PUBLISH=true  # Enable auto-publish
   ```

**Recommendation**: Keep `LINKEDIN_AUTO_PUBLISH=false` and review posts manually.

## Configuration

### Scheduler Settings

```env
CRON_SCHEDULE=0 */6 * * *  # Every 6 hours
```

Cron format examples:
- `0 9 * * *` - Every day at 9 AM
- `0 */2 * * *` - Every 2 hours
- `*/30 * * * *` - Every 30 minutes

### Content Generation

```env
MIN_COMMIT_COUNT=1        # Minimum commits to trigger post
LOG_LEVEL=info            # debug|info|warn|error
```

## Development

### Running Tests

```bash
npm test
```

### Manual Queue Management

Get pending posts:
```javascript
const WorkflowEngine = require('./workflows/workflowEngine');
const engine = new WorkflowEngine();
console.log(engine.getQueue());
```

Publish from queue:
```javascript
await engine.publishFromQueue('queue_id_here');
```

## Troubleshooting

### Common Issues

**No signals detected**:
- Check GitHub token permissions
- Verify `GITHUB_USERNAME` is correct
- Look in `logs/automation.log` for errors

**Content generation fails**:
- HuggingFace token may be invalid/expired
- Model may be loading (503 error) - retry later
- Fallback templates will be used automatically

**LinkedIn publishing fails**:
- Token may be expired (valid for 60 days)
- Ensure `w_member_social` scope is granted
- Queue-first mode (manual) is more reliable

### Logs

Check logs for detailed information:
```bash
tail -f logs/automation.log
```

## Production Considerations

### Security

- ✅ Never commit `.env` file
- ✅ Rotate API tokens regularly
- ✅ Use queue-first publishing for review
- ✅ Monitor API rate limits

### Rate Limits

- **GitHub**: 5,000 requests/hour (authenticated)
- **HuggingFace**: Varies by model (typically ~1000/day free)
- **Unsplash**: 50 requests/hour
- **Pexels**: 200 requests/hour
- **LinkedIn**: 100 API calls/day per user

### Monitoring

Health check endpoint:
```javascript
const engine = new WorkflowEngine();
const health = await engine.getHealthStatus();
console.log(health);
```

## Architecture

### Phase-Based Pipeline

1. **Phase 1**: Foundation (logging, state, scheduling)
2. **Phase 2**: Signal Detection (GitHub triggers, classification)
3. **Phase 3**: Context Building (data fetching, normalization)
4. **Phase 4**: Prompt Engineering (LLM prompt construction)
5. **Phase 5**: Content Generation (text + image)
6. **Phase 6**: Publishing (queue or auto-publish)

### Extensibility

Easy to add new:
- **Signal sources**: Twitter, RSS feeds, etc.
- **Content generators**: OpenAI, Anthropic, local models
- **Publishing targets**: Twitter, Medium, etc.

All modules follow consistent interfaces.

## License

MIT License - see LICENSE file

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create feature branch
3. Add tests for new features
4. Submit pull request

## Support

For issues and questions:
- GitHub Issues: [Create an issue](https://github.com/SyedFrazAli/linkedin-automation-engine/issues)
- Documentation: This README

## Disclaimer

**Important**:
- This tool generates content suggestions, not final posts
- Always review generated content before publishing
- Respect LinkedIn's Terms of Service
- Rate limits apply to all APIs
- LinkedIn auto-publishing requires OAuth setup

---

**Built with ❤️ for automating professional content creation**

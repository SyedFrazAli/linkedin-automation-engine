// triggers/githubTrigger.js
const axios = require('axios');
const logger = require('../utils/logger');
const stateStore = require('../utils/stateStore');

class GitHubTrigger {
  constructor() {
    this.token = process.env.GITHUB_TOKEN;
    this.owner = process.env.GITHUB_OWNER || 'SyedFrazAli';
    this.repo = process.env.GITHUB_REPO;
    this.baseUrl = 'https://api.github.com';
    
    if (!this.token) {
      logger.warn('GITHUB_TOKEN not found in environment variables');
    }
  }

  // Build GitHub API headers
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  // Fetch recent commits for a repository
  async fetchRecentCommits(repo, limit = 10) {
    try {
      logger.info('Fetching recent commits', { repo, limit });
      
      const response = await axios.get(
        `${this.baseUrl}/repos/${this.owner}/${repo}/commits`,
        {
          headers: this.getHeaders(),
          params: { per_page: limit }
        }
      );
      
      logger.info('Commits fetched successfully', { count: response.data.length });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch commits', { repo, error: error.message });
      throw error;
    }
  }

  // Fetch README content
  async fetchReadme(repo) {
    try {
      logger.info('Fetching README', { repo });
      
      const response = await axios.get(
        `${this.baseUrl}/repos/${this.owner}/${repo}/readme`,
        { headers: this.getHeaders() }
      );
      
      logger.info('README fetched successfully');
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch README', { repo, error: error.message });
      throw error;
    }
  }

  // Fetch recent issues (open)
  async fetchRecentIssues(repo, limit = 10) {
    try {
      logger.info('Fetching recent issues', { repo, limit });
      
      const response = await axios.get(
        `${this.baseUrl}/repos/${this.owner}/${repo}/issues`,
        {
          headers: this.getHeaders(),
          params: { 
            state: 'open',
            per_page: limit,
            sort: 'created',
            direction: 'desc'
          }
        }
      );
      
      logger.info('Issues fetched successfully', { count: response.data.length });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch issues', { repo, error: error.message });
      throw error;
    }
  }

  // Detect new signals from GitHub activity
  async detectSignals(repo) {
    logger.info('Detecting GitHub signals', { repo });
    const signals = [];

    try {
      // Fetch commits
      const commits = await this.fetchRecentCommits(repo, 5);
      
      for (const commit of commits) {
        const signalId = `commit:${commit.sha}`;
        
        // Check if already processed
        if (!stateStore.hasProcessed(signalId)) {
          signals.push({
            type: 'commit',
            id: signalId,
            data: {
              sha: commit.sha,
              message: commit.commit.message,
              author: commit.commit.author.name,
              date: commit.commit.author.date,
              url: commit.html_url,
              files_changed: commit.files ? commit.files.length : 0
            },
            confidence: 0.7 // Base confidence for commits
          });
          
          logger.info('New commit signal detected', { sha: commit.sha.substring(0, 7) });
        }
      }

      // Fetch README and check for changes
      try {
        const readme = await this.fetchReadme(repo);
        const readmeSignalId = `readme:${readme.sha}`;
        
        if (!stateStore.hasProcessed(readmeSignalId)) {
          signals.push({
            type: 'readme_update',
            id: readmeSignalId,
            data: {
              sha: readme.sha,
              name: readme.name,
              path: readme.path,
              url: readme.html_url,
              size: readme.size
            },
            confidence: 0.8 // Higher confidence for README updates
          });
          
          logger.info('README update signal detected');
        }
      } catch (readmeError) {
        logger.debug('README check skipped', { error: readmeError.message });
      }

      // Fetch recent issues
      try {
        const issues = await this.fetchRecentIssues(repo, 5);
        
        for (const issue of issues) {
          // Skip pull requests (they appear as issues in GitHub API)
          if (issue.pull_request) continue;
          
          const issueSignalId = `issue:${issue.number}`;
          
          if (!stateStore.hasProcessed(issueSignalId)) {
            signals.push({
              type: 'issue',
              id: issueSignalId,
              data: {
                number: issue.number,
                title: issue.title,
                state: issue.state,
                author: issue.user.login,
                created_at: issue.created_at,
                url: issue.html_url,
                labels: issue.labels.map(l => l.name)
              },
              confidence: 0.6 // Lower confidence for issues
            });
            
            logger.info('New issue signal detected', { number: issue.number });
          }
        }
      } catch (issueError) {
        logger.debug('Issue check skipped', { error: issueError.message });
      }

      logger.info('Signal detection complete', { 
        repo, 
        total_signals: signals.length,
        types: signals.reduce((acc, s) => {
          acc[s.type] = (acc[s.type] || 0) + 1;
          return acc;
        }, {})
      });

      return signals;
    } catch (error) {
      logger.error('Signal detection failed', { repo, error: error.message });
      throw error;
    }
  }

  // Mark signal as processed
  markProcessed(signal) {
    stateStore.markProcessed(signal.id, {
      type: signal.type,
      timestamp: new Date().toISOString(),
      confidence: signal.confidence
    });
    logger.debug('Signal marked as processed', { id: signal.id, type: signal.type });
  }
}

module.exports = { GitHubTrigger };

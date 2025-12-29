// services/linkedinPublisher.js
const axios = require('axios');
const logger = require('../utils/logger');

/**
 * PHASE 6: LinkedIn Publishing
 * Queue-first approach with optional auto-publish
 * Handles LinkedIn Share API integration
 * CRITICAL: LinkedIn API posting requires Company Page or manual approval
 */
class LinkedInPublisher {
  constructor() {
    this.config = {
      apiBaseUrl: 'https://api.linkedin.com/v2',
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN || null,
      personUrn: process.env.LINKEDIN_PERSON_URN || null, // Format: urn:li:person:XXXXXXXX
      autoPublish: process.env.LINKEDIN_AUTO_PUBLISH === 'true' || false
    };
    this.queue = [];
  }

  /**
   * Publish or queue LinkedIn post
   * @param {Object} content - Generated content with text, image, metadata
   * @returns {Object} { status, postId?, queueId?, error? }
   */
  async publish(content) {
    try {
      logger.info('LinkedInPublisher: Processing publish request', {
        autoPublish: this.config.autoPublish,
        hasImage: !!content.image?.url
      });

      // Validate content
      if (!this._validateContent(content)) {
        throw new Error('Invalid content structure');
      }

      // Strategy 1: Queue for manual approval (SAFE DEFAULT)
      if (!this.config.autoPublish || !this.config.accessToken) {
        return await this._queuePost(content);
      }

      // Strategy 2: Attempt auto-publish (requires valid LinkedIn token)
      return await this._attemptAutoPublish(content);

    } catch (error) {
      logger.error('LinkedInPublisher: Publish failed', {
        error: error.message
      });

      return {
        status: 'error',
        error: error.message,
        fallback: 'Content queued for manual review',
        queueId: await this._queuePost(content)
      };
    }
  }

  /**
   * Queue post for manual approval/review
   */
  async _queuePost(content) {
    const queueItem = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: content,
      status: 'pending',
      createdAt: new Date().toISOString(),
      metadata: {
        topic: content.metadata?.topic,
        signalType: content.metadata?.signalType
      }
    };

    this.queue.push(queueItem);

    logger.info('LinkedInPublisher: Content queued', {
      queueId: queueItem.id,
      queueSize: this.queue.length
    });

    return {
      status: 'queued',
      queueId: queueItem.id,
      message: 'Post queued for manual review. Use getQueue() to retrieve pending posts.',
      viewUrl: null // Could be admin dashboard URL
    };
  }

  /**
   * Attempt to auto-publish to LinkedIn
   * CRITICAL: Requires LinkedIn OAuth token with w_member_social scope
   */
  async _attemptAutoPublish(content) {
    if (!this.config.accessToken || !this.config.personUrn) {
      throw new Error('LinkedIn credentials not configured');
    }

    try {
      // Prepare LinkedIn Share API payload
      const sharePayload = {
        author: this.config.personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: content.text
            },
            shareMediaCategory: content.image?.url ? 'IMAGE' : 'NONE'
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      };

      // Add image if available
      if (content.image?.url) {
        // Note: LinkedIn requires image to be uploaded first via registerUpload API
        // This is simplified - production needs multi-step upload process
        sharePayload.specificContent['com.linkedin.ugc.ShareContent'].media = [
          {
            status: 'READY',
            description: {
              text: content.image.alt || ''
            },
            media: content.image.uploadedUrn || content.image.url,
            title: {
              text: content.metadata?.topic || 'LinkedIn Post'
            }
          }
        ];
      }

      // Post to LinkedIn UGC API
      const response = await axios.post(
        `${this.config.apiBaseUrl}/ugcPosts`,
        sharePayload,
        {
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0'
          },
          timeout: 15000
        }
      );

      const postId = response.data.id || response.headers['x-restli-id'];

      logger.info('LinkedInPublisher: Auto-publish successful', {
        postId: postId
      });

      return {
        status: 'published',
        postId: postId,
        publishedAt: new Date().toISOString(),
        url: `https://www.linkedin.com/feed/update/${postId}/`
      };

    } catch (error) {
      // Handle LinkedIn API errors
      if (error.response?.status === 401) {
        logger.error('LinkedInPublisher: Token expired or invalid');
        throw new Error('LinkedIn authentication failed - token may be expired');
      } else if (error.response?.status === 403) {
        logger.error('LinkedInPublisher: Insufficient permissions');
        throw new Error('LinkedIn API permissions insufficient - requires w_member_social scope');
      } else {
        logger.error('LinkedInPublisher: API error', {
          status: error.response?.status,
          message: error.message
        });
        throw error;
      }
    }
  }

  /**
   * Validate content structure
   */
  _validateContent(content) {
    if (!content || typeof content.text !== 'string' || content.text.length === 0) {
      logger.warn('LinkedInPublisher: Invalid content - missing text');
      return false;
    }

    if (content.text.length > 3000) {
      logger.warn('LinkedInPublisher: Content exceeds LinkedIn character limit');
      return false;
    }

    return true;
  }

  /**
   * Get queued posts
   * @param {String} status - Filter by status: 'pending', 'published', 'all'
   * @returns {Array} Queued posts
   */
  getQueue(status = 'pending') {
    if (status === 'all') {
      return this.queue;
    }
    return this.queue.filter(item => item.status === status);
  }

  /**
   * Manually approve and publish queued post
   * @param {String} queueId - Queue item ID
   * @returns {Object} Publish result
   */
  async publishFromQueue(queueId) {
    const queueItem = this.queue.find(item => item.id === queueId);

    if (!queueItem) {
      throw new Error(`Queue item ${queueId} not found`);
    }

    if (queueItem.status !== 'pending') {
      throw new Error(`Queue item ${queueId} already processed`);
    }

    logger.info('LinkedInPublisher: Publishing from queue', { queueId });

    const result = await this._attemptAutoPublish(queueItem.content);

    // Update queue item status
    queueItem.status = 'published';
    queueItem.publishedAt = new Date().toISOString();
    queueItem.postId = result.postId;

    return result;
  }

  /**
   * Remove item from queue
   * @param {String} queueId - Queue item ID
   */
  removeFromQueue(queueId) {
    const index = this.queue.findIndex(item => item.id === queueId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      logger.info('LinkedInPublisher: Removed from queue', { queueId });
      return true;
    }
    return false;
  }

  /**
   * Health check for LinkedIn API
   */
  async healthCheck() {
    if (!this.config.accessToken || !this.config.personUrn) {
      return {
        status: 'degraded',
        mode: 'queue-only',
        message: 'No LinkedIn credentials configured. Posts will be queued for manual publishing.',
        autoPublish: false
      };
    }

    try {
      // Test LinkedIn API connection
      const response = await axios.get(
        `${this.config.apiBaseUrl}/me`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`
          },
          timeout: 5000
        }
      );

      return {
        status: 'healthy',
        mode: this.config.autoPublish ? 'auto-publish' : 'queue-first',
        autoPublish: this.config.autoPublish,
        authenticated: true
      };

    } catch (error) {
      logger.warn('LinkedInPublisher: Health check failed', {
        error: error.message
      });

      return {
        status: 'degraded',
        mode: 'queue-only',
        message: 'LinkedIn API authentication failed. Check access token.',
        autoPublish: false
      };
    }
  }
}

module.exports = LinkedInPublisher;

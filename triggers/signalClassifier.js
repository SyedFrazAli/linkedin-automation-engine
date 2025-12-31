// triggers/signalClassifier.js
const logger = require('../utils/logger')
  class SignalClassifier {
  constructor() {
    // File extension to category mappings
    this.extensionMap = {
      // Code files
      js: 'code', jsx: 'code', ts: 'code', tsx: 'code',
      py: 'code', java: 'code', cpp: 'code', c: 'code', h: 'code',
      go: 'code', rs: 'code', rb: 'code', php: 'code', swift: 'code',
      kt: 'code', scala: 'code', cs: 'code',
      
      // Documentation files
      md: 'docs', txt: 'docs', rst: 'docs', adoc: 'docs',
      
      // Config files
      json: 'config', yml: 'config', yaml: 'config', toml: 'config',
      xml: 'config', ini: 'config', env: 'config', conf: 'config',
      
      // Build/dependency files
      lock: 'config', gradle: 'config', pom: 'config'
    };
    
    // Path-based categorization rules
    this.pathRules = [
      { pattern: /^(docs?|documentation)\//i, category: 'docs' },
      { pattern: /\.github\//i, category: 'config' },
      { pattern: /^(src|lib|app|core)\//i, category: 'code' },
      { pattern: /^(test|__tests__|spec)\//i, category: 'code' },
      { pattern: /^(config|conf|settings)\//i, category: 'config' }
    ];
    
    // Confidence modifiers based on file names
    this.importantFiles = [
      'README', 'CHANGELOG', 'CONTRIBUTING',
      'package.json', 'setup.py', 'Cargo.toml',
      'main', 'index', 'app'
    ];
  }

  // Get file extension from filename
  getExtension(filename) {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  }

  // Categorize file based on extension and path
  categorizeFile(filepath) {
    // Check path-based rules first
    for (const rule of this.pathRules) {
      if (rule.pattern.test(filepath)) {
        return rule.category;
      }
    }
    
    // Check extension mapping
    const ext = this.getExtension(filepath);
    if (ext && this.extensionMap[ext]) {
      return this.extensionMap[ext];
    }
    
    return 'unknown';
  }

  // Check if file is important based on name
  isImportantFile(filepath) {
    const filename = filepath.split('/').pop().toLowerCase();
    return this.importantFiles.some(important => 
      filename.startsWith(important.toLowerCase())
    );
  }

  // Calculate confidence modifier based on file importance
  calculateFileConfidence(filepath, baseConfidence) {
    let confidence = baseConfidence;
    
    // Boost confidence for important files
    if (this.isImportantFile(filepath)) {
      confidence = Math.min(1.0, confidence + 0.15);
    }
    
    // Reduce confidence for test files
    if (/test|spec|__tests__/i.test(filepath)) {
      confidence = Math.max(0.3, confidence - 0.1);
    }
    
    // Reduce confidence for config changes
    const category = this.categorizeFile(filepath);
    if (category === 'config' && !this.isImportantFile(filepath)) {
      confidence = Math.max(0.4, confidence - 0.1);
    }
    
    return confidence;
  }

  // Classify a commit signal
  classifyCommit(signal) {
    logger.debug('Classifying commit signal', { sha: signal.data.sha.substring(0, 7) });
    
    // For commits, we need to fetch file information
    // For now, use commit message heuristics
    const message = signal.data.message.toLowerCase();
    
    let category = 'unknown';
    let confidenceAdjustment = 0;
    
    // Message-based classification
    if (/\b(feat|feature|add|implement)\b/i.test(message)) {
      category = 'code';
      confidenceAdjustment = 0.1;
    } else if (/\b(docs?|readme|documentation)\b/i.test(message)) {
      category = 'docs';
      confidenceAdjustment = 0.15;
    } else if (/\b(fix|bug|patch|hotfix)\b/i.test(message)) {
      category = 'code';
      confidenceAdjustment = 0.05;
    } else if (/\b(config|setup|build|ci|cd)\b/i.test(message)) {
      category = 'config';
      confidenceAdjustment = -0.05;
    } else if (/\b(refactor|cleanup|style)\b/i.test(message)) {
      category = 'code';
      confidenceAdjustment = 0;
    }
    
    const finalConfidence = Math.max(0.3, Math.min(1.0, 
      signal.confidence + confidenceAdjustment
    ));
    
    return {
      ...signal,
      category,
      confidence: finalConfidence,
      classification: {
        method: 'commit_message_heuristic',
        original_confidence: signal.confidence
      }
    };
  }

  // Classify a README update signal
  classifyReadme(signal) {
    logger.debug('Classifying README signal');
    
    // README updates are always docs and high value
    return {
      ...signal,
      category: 'docs',
      confidence: Math.min(1.0, signal.confidence + 0.1),
      classification: {
        method: 'readme_direct',
        original_confidence: signal.confidence
      }
    };
  }

  // Classify an issue signal
  classifyIssue(signal) {
    logger.debug('Classifying issue signal', { number: signal.data.number });
    
    const title = signal.data.title.toLowerCase();
    const labels = signal.data.labels;
    
    let category = 'unknown';
    let confidenceAdjustment = 0;
    
    // Label-based classification
    if (labels.includes('bug') || labels.includes('fix')) {
      category = 'code';
      confidenceAdjustment = 0.05;
    } else if (labels.includes('documentation') || labels.includes('docs')) {
      category = 'docs';
      confidenceAdjustment = 0.1;
    } else if (labels.includes('feature') || labels.includes('enhancement')) {
      category = 'code';
      confidenceAdjustment = 0.1;
    }
    
    // Title-based classification if no labels matched
    if (category === 'unknown') {
      if (/\b(bug|error|broken|crash)\b/i.test(title)) {
        category = 'code';
        confidenceAdjustment = 0;
      } else if (/\b(docs?|readme|documentation)\b/i.test(title)) {
        category = 'docs';
        confidenceAdjustment = 0.05;
      } else if (/\b(feature|enhancement|improve)\b/i.test(title)) {
        category = 'code';
        confidenceAdjustment = 0.05;
      }
    }
    
    const finalConfidence = Math.max(0.3, Math.min(1.0, 
      signal.confidence + confidenceAdjustment
    ));
    
    return {
      ...signal,
      category,
      confidence: finalConfidence,
      classification: {
        method: 'issue_labels_title',
        original_confidence: signal.confidence
      }
    };
  }

  // Main classification method
  classify(signal) {
    logger.info('Classifying signal', { type: signal.type, id: signal.id });
    
    let classified;
    
    switch (signal.type) {
      case 'commit':
        classified = this.classifyCommit(signal);
        break;
      case 'readme_update':
        classified = this.classifyReadme(signal);
        break;
      case 'issue':
        classified = this.classifyIssue(signal);
        break;
      default:
        logger.warn('Unknown signal type', { type: signal.type });
        classified = {
          ...signal,
          category: 'unknown',
          classification: { method: 'unhandled_type' }
        };
    }
    
    logger.info('Signal classified', {
      id: signal.id,
      category: classified.category,
      confidence: classified.confidence.toFixed(2),
      original_confidence: signal.confidence.toFixed(2)
    });
    
    return classified;
  }

  // Classify multiple signals
  classifyBatch(signals) {
    logger.info('Classifying signal batch', { count: signals.length });
    return signals.map(signal => this.classify(signal));
  }

  // Filter signals by minimum confidence threshold
  filterByConfidence(signals, minConfidence = 0.5) {
    const filtered = signals.filter(s => s.confidence >= minConfidence);
    logger.info('Filtered signals by confidence', {
      original: signals.length,
      filtered: filtered.length,
      threshold: minConfidence
    });
    return filtered;
  }
}

module.exports = { SignalClassifier };

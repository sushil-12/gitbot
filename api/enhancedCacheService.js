import { MongoClient, ServerApiVersion } from 'mongodb';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

class EnhancedQueryCacheService {
  constructor() {
    this.client = null;
    this.db = null;
    this.collection = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      const uri = process.env.MONGODB_URI;
      if (!uri) {
        console.log('⚠️ MONGODB_URI not set, using in-memory cache for testing');
        this.isConnected = false;
        return false;
      }
      console.log('uri', uri);
      // Create a MongoClient with a MongoClientOptions object to set the Stable API version
      this.client = new MongoClient(uri, {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true,
        }
      });
      await this.client.connect();
      this.db = this.client.db('gitbot_cache');
      this.collection = this.db.collection('query_cache');
      this.isConnected = true;
      
      // Create indexes for better performance
      await this.collection.createIndex({ query_hash: 1 });
      await this.collection.createIndex({ similar_queries: 1 });
      await this.collection.createIndex({ keywords: 1 });
      await this.collection.createIndex({ intent: 1 });
      
      console.log('✅ Enhanced Cache Service connected to MongoDB');
      return true;
    } catch (error) {
      console.log('⚠️ Failed to connect to MongoDB, using in-memory cache for testing:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  generateHash(query) {
    return crypto.createHash('sha256').update(query.toLowerCase().trim()).digest('hex');
  }

  extractKeywords(query) {
    const stopWords = new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'
    ]);

    return query.toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .map(word => word.trim());
  }

  generateSimilarQueries(query, intent) {
    const variations = {
      'clone_repo': [
        'download repository',
        'get a repo', 
        'clone repository',
        'repo clone',
        'download repo',
        'get repository',
        'fetch repo',
        'pull repository'
      ],
      'push_changes': [
        'push my changes',
        'upload changes',
        'send changes',
        'push code',
        'upload code',
        'commit and push',
        'push to remote'
      ],
      'list_repos': [
        'show my repos',
        'list repositories',
        'show repositories',
        'my repos',
        'list all repos',
        'show all repositories'
      ],
      'git_status': [
        'show status',
        'check status',
        'git state',
        'show changes',
        'what changed',
        'check changes'
      ],
      'git_diff': [
        'show diff',
        'show differences',
        'what changed',
        'show changes',
        'diff files'
      ],
      'git_log': [
        'show log',
        'show history',
        'show commits',
        'commit history',
        'git history'
      ],
      'create_branch': [
        'new branch',
        'make branch',
        'add branch',
        'create new branch'
      ],
      'checkout_branch': [
        'switch branch',
        'change branch',
        'go to branch',
        'switch to branch'
      ],
      'merge_branch': [
        'merge changes',
        'combine branches',
        'merge code'
      ],
      'create_pr': [
        'create pull request',
        'make pr',
        'open pr',
        'create merge request',
        'make pull request'
      ]
    };

    return variations[intent] || [];
  }

  async findSimilarQuery(userQuery) {
    if (!this.isConnected) {
      console.log('⚠️ Cache service not connected, skipping cache lookup');
      return null;
    }

    const normalizedQuery = userQuery.toLowerCase().trim();
    console.log(`🔍 Looking for similar query: "${normalizedQuery}"`);

    // 1. Exact match (fastest)
    let cached = await this.getExactMatch(normalizedQuery);
    if (cached) {
      console.log('✅ Exact cache hit');
      return cached;
    }

    // 2. Fuzzy match in similar_queries
    cached = await this.getFuzzyMatch(normalizedQuery);
    if (cached) {
      console.log('✅ Fuzzy cache hit');
      return cached;
    }

    // 3. Keyword match
    cached = await this.getKeywordMatch(normalizedQuery);
    if (cached) {
      console.log('✅ Keyword cache hit');
      return cached;
    }

    console.log('❌ No cache hit found');
    return null;
  }

  async getExactMatch(query) {
    const hash = this.generateHash(query);
    const cached = await this.collection.findOne({ query_hash: hash });
    
    if (cached) {
      // Update usage stats
      await this.collection.updateOne(
        { query_hash: hash },
        { 
          $inc: { usage_count: 1 },
          $set: { last_used: new Date() }
        }
      );
      return cached;
    }
    return null;
  }

  async getFuzzyMatch(query) {
    // Check if query exists in similar_queries array
    const match = await this.collection.findOne({
      similar_queries: { $in: [query] }
    });
    
    if (match) {
      // Add this query to similar_queries for future matches
      await this.collection.updateOne(
        { _id: match._id },
        { 
          $addToSet: { similar_queries: query },
          $inc: { usage_count: 1 },
          $set: { last_used: new Date() }
        }
      );
      return match;
    }
    return null;
  }

  async getKeywordMatch(query) {
    const keywords = this.extractKeywords(query);
    if (keywords.length === 0) return null;

    // Find documents that contain all the keywords
    const match = await this.collection.findOne({
      keywords: { $all: keywords }
    });

    if (match) {
      // Update usage stats
      await this.collection.updateOne(
        { _id: match._id },
        { 
          $inc: { usage_count: 1 },
          $set: { last_used: new Date() }
        }
      );
      return match;
    }
    return null;
  }

  async cacheResponse(query, intent, entities, confidence) {
    if (!this.isConnected) {
      console.log('⚠️ Cache service not connected, skipping cache save');
      return false;
    }
    try {
      const query_hash = this.generateHash(query);
      const keywords = this.extractKeywords(query);
      const similar_queries = this.generateSimilarQueries(query, intent);
      await this.collection.insertOne({
        query,
        query_hash,
        intent,
        entities,
        confidence,
        similar_queries,
        keywords,
        created_at: new Date(),
        usage_count: 1,
        last_used: new Date()
      });
      return true;
    } catch (error) {
      console.log('❌ Failed to cache response:', error.message);
      return false;
    }
  }

  async getCacheStats() {
    if (!this.isConnected) return null;

    try {
      const stats = await this.collection.aggregate([
        {
          $group: {
            _id: null,
            totalQueries: { $sum: 1 },
            totalUsage: { $sum: '$usage_count' },
            avgConfidence: { $avg: '$confidence' }
          }
        }
      ]).toArray();

      const topQueries = await this.collection.find()
        .sort({ usage_count: -1 })
        .limit(10)
        .toArray();

      return {
        stats: stats[0] || {},
        topQueries: topQueries.map(q => ({
          query: q.normalized_query,
          intent: q.intent,
          usage: q.usage_count
        }))
      };
    } catch (error) {
      console.error('❌ Failed to get cache stats:', error.message);
      return null;
    }
  }

  async clearCache() {
    if (!this.isConnected) return false;

    try {
      await this.collection.deleteMany({});
      console.log('🗑️ Cache cleared successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to clear cache:', error.message);
      return false;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      console.log('🔌 Cache service disconnected');
    }
  }
}

export default EnhancedQueryCacheService; 
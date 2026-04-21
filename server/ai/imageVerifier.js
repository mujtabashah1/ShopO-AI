/**
 * Image Verifier
 * --------------
 * Simple wrapper that sends the uploaded image to GPT-4o (via OpenRouter)
 * and returns brand + verdict + confidence.
 *
 * No hash matching, no MobileNet — just one AI call.
 */

const { verifyAuthenticity, isAvailable } = require('../utils/geminiVision');

const verifyProductImage = async ({ imageBuffer, fileSize, mimetype, originalName, category = 'electronics' }) => {
    const startTime = Date.now();

    if (!isAvailable()) {
        return {
            confidenceScore: 0,
            status: 'Inconclusive',
            statusExplanation: 'Vision AI is not configured. Set OPENROUTER_API_KEY in .env.',
            modelUsed: 'none',
            processingTimeMs: Date.now() - startTime,
            category,
            geminiAnalysis: null,
            fileInfo: {
                originalName: originalName || 'unknown',
                mimetype: mimetype || 'unknown',
                fileSize: fileSize || 0,
                fileSizeFormatted: fileSize ? `${(fileSize / 1024).toFixed(1)} KB` : 'unknown'
            }
        };
    }

    let result;
    try {
        result = await verifyAuthenticity(imageBuffer, mimetype, category);
    } catch (err) {
        return {
            confidenceScore: 0,
            status: 'Inconclusive',
            statusExplanation: `Vision AI failed: ${err.message}`,
            modelUsed: process.env.OPENROUTER_MODEL || 'openai/gpt-4o',
            processingTimeMs: Date.now() - startTime,
            category,
            geminiAnalysis: null,
            fileInfo: {
                originalName: originalName || 'unknown',
                mimetype: mimetype || 'unknown',
                fileSize: fileSize || 0,
                fileSizeFormatted: fileSize ? `${(fileSize / 1024).toFixed(1)} KB` : 'unknown'
            }
        };
    }

    return {
        confidenceScore: result.confidence,
        status: result.verdict,
        statusExplanation: result.explanation || '',
        modelUsed: process.env.OPENROUTER_MODEL || 'openai/gpt-4o',
        processingTimeMs: Date.now() - startTime,
        category,
        // Full AI analysis for the UI
        geminiAnalysis: {
            verdict: result.verdict,
            confidence: result.confidence,
            brand: result.brand,
            productType: result.productType,
            redFlags: result.redFlags,
            positiveSignals: result.positiveSignals,
            explanation: result.explanation,
        },
        fileInfo: {
            originalName: originalName || 'unknown',
            mimetype: mimetype || 'unknown',
            fileSize: fileSize || 0,
            fileSizeFormatted: fileSize ? `${(fileSize / 1024).toFixed(1)} KB` : 'unknown'
        }
    };
};

module.exports = { verifyProductImage };

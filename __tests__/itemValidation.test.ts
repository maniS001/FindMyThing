/**
 * Item Reporting & Verification Security Test Suite
 * Tests field validation, verification quiz evaluation, and security checks.
 */

interface ReportItemInput {
    title: string;
    category: string;
    location: string;
    description?: string;
    date?: string;
    type: 'LOST' | 'FOUND';
}

function validateReportItem(item: ReportItemInput): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!item.title || item.title.trim().length < 3) {
        errors.push('Title must be at least 3 characters long');
    }

    const validCategories = ['ELECTRONICS', 'WALLETS', 'BAGS', 'DOCUMENTS', 'JEWELRY', 'KEYS', 'PETS', 'OTHERS'];
    if (!item.category || !validCategories.includes(item.category.toUpperCase())) {
        errors.push('A valid category is required');
    }

    if (!item.location || item.location.trim().length < 2) {
        errors.push('Location is required');
    }

    if (!['LOST', 'FOUND'].includes(item.type)) {
        errors.push('Item type must be either LOST or FOUND');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

function verifyClaimAnswer(expectedAnswer: string, userAnswer: string): boolean {
    if (!expectedAnswer || !userAnswer) return false;
    const cleanExpected = expectedAnswer.trim().toLowerCase();
    const cleanUser = userAnswer.trim().toLowerCase();
    
    // Direct match or contains match
    return cleanExpected === cleanUser || 
           cleanExpected.includes(cleanUser) || 
           cleanUser.includes(cleanExpected);
}

describe('Item Reporting Validation', () => {
    test('should validate a complete and valid LOST item report', () => {
        const report: ReportItemInput = {
            title: 'Black Leather Wallet',
            category: 'WALLETS',
            location: 'Chidambaram Bus Stand',
            type: 'LOST',
            description: 'Lost near the ticket counter'
        };

        const result = validateReportItem(report);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    test('should validate a complete and valid FOUND item report', () => {
        const report: ReportItemInput = {
            title: 'Titan Fastrack Watch',
            category: 'ELECTRONICS',
            location: 'Railway Station Platform 1',
            type: 'FOUND'
        };

        const result = validateReportItem(report);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    test('should reject reports with titles that are too short or empty', () => {
        const report: ReportItemInput = {
            title: '  ',
            category: 'KEYS',
            location: 'Market Street',
            type: 'LOST'
        };

        const result = validateReportItem(report);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Title must be at least 3 characters long');
    });

    test('should reject reports with invalid category', () => {
        const report: ReportItemInput = {
            title: 'House Key with Red Keychain',
            category: 'UNKNOWN_CATEGORY',
            location: 'Temple Gate',
            type: 'LOST'
        };

        const result = validateReportItem(report);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('A valid category is required');
    });

    test('should reject reports with missing location', () => {
        const report: ReportItemInput = {
            title: 'College ID Card',
            category: 'DOCUMENTS',
            location: '',
            type: 'LOST'
        };

        const result = validateReportItem(report);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Location is required');
    });
});

describe('Ownership Verification Quiz', () => {
    test('should verify correct answer with exact case-insensitive match', () => {
        const isMatch = verifyClaimAnswer('Blue Fossil Bag with Disney Keychain', 'blue fossil bag with disney keychain');
        expect(isMatch).toBe(true);
    });

    test('should match correct answer with extra whitespace or trimming', () => {
        const isMatch = verifyClaimAnswer('  Honda Activa key  ', 'honda activa key');
        expect(isMatch).toBe(true);
    });

    test('should verify answer if user provides key unique identifier', () => {
        const isMatch = verifyClaimAnswer('Black wallet with SBI Debit card', 'SBI Debit card');
        expect(isMatch).toBe(true);
    });

    test('should reject clearly wrong answers', () => {
        const isMatch = verifyClaimAnswer('Black Samsung Galaxy phone with cracked screen', 'iPhone 15 red color');
        expect(isMatch).toBe(false);
    });

    test('should reject empty or undefined claimant answers', () => {
        expect(verifyClaimAnswer('Secret Code 1234', '')).toBe(false);
        expect(verifyClaimAnswer('', 'Secret Code 1234')).toBe(false);
    });
});

/**
 * Complaint Optional Phone Privacy & Direct Call Exposure Tests
 */

function validateComplaintSubmission(input: {
    name?: string;
    location?: string;
    contactInfo?: string;
    exposePhoneNumber?: boolean;
}) {
    const errors: string[] = [];
    if (!input.name || !input.name.trim()) errors.push('Item name is required');
    if (!input.location || !input.location.trim()) errors.push('Location is required');

    const cleanContact = (input.contactInfo && input.contactInfo.trim()) || null;
    const canExpose = Boolean(input.exposePhoneNumber) && Boolean(cleanContact);

    return {
        isValid: errors.length === 0,
        errors,
        normalized: {
            contactInfo: cleanContact,
            exposePhoneNumber: canExpose,
        },
    };
}

function sanitizeComplaintForViewer(
    complaint: { id: string; userId?: string | null; contactInfo?: string | null; exposePhoneNumber: boolean },
    viewerUserId?: string | null
) {
    const isOwner = Boolean(viewerUserId && complaint.userId === viewerUserId);
    return {
        ...complaint,
        contactInfo: complaint.exposePhoneNumber || isOwner ? complaint.contactInfo : null,
    };
}

describe('Complaint Optional Phone & Exposure Toggle', () => {
    test('should allow complaint submission without any phone number', () => {
        const res = validateComplaintSubmission({
            name: 'Blue Backpack',
            location: 'Chennai Central',
            contactInfo: '',
            exposePhoneNumber: false,
        });
        expect(res.isValid).toBe(true);
        expect(res.normalized.contactInfo).toBeNull();
        expect(res.normalized.exposePhoneNumber).toBe(false);
    });

    test('should not enable exposePhoneNumber if phone number is blank', () => {
        const res = validateComplaintSubmission({
            name: 'Wallet',
            location: 'Metro Station',
            contactInfo: '   ',
            exposePhoneNumber: true,
        });
        expect(res.isValid).toBe(true);
        expect(res.normalized.contactInfo).toBeNull();
        expect(res.normalized.exposePhoneNumber).toBe(false);
    });

    test('should keep contactInfo private from founders when exposePhoneNumber is false', () => {
        const complaint = {
            id: 'c1',
            userId: 'victim-1',
            contactInfo: '+919876543210',
            exposePhoneNumber: false,
        };
        const viewerView = sanitizeComplaintForViewer(complaint, 'founder-2');
        const ownerView = sanitizeComplaintForViewer(complaint, 'victim-1');

        expect(viewerView.contactInfo).toBeNull();
        expect(ownerView.contactInfo).toBe('+919876543210');
    });

    test('should expose contactInfo for direct call when victim agrees (exposePhoneNumber: true)', () => {
        const complaint = {
            id: 'c2',
            userId: 'victim-1',
            contactInfo: '+919876543210',
            exposePhoneNumber: true,
        };
        const founderView = sanitizeComplaintForViewer(complaint, 'founder-2');
        expect(founderView.contactInfo).toBe('+919876543210');
    });
});

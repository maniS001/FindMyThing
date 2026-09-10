import { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { Plus, Users, UserPlus, X, Search, CheckCircle, XCircle, Lock, Globe, ChevronRight, ChevronDown, Share2 } from 'lucide-react-native';
import { Share } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../constants/api';
import { showAlert } from '../../utils/alert';
import * as Contacts from 'expo-contacts';
import * as SMS from 'expo-sms';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';


type TabType = 'MY' | 'JOIN' | 'REQUESTS';

export default function CommunitiesScreen() {
    const { colors } = useTheme();
    const { token } = useAuth();
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<TabType>('MY');
    const [myComms, setMyComms] = useState<any[]>([]);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [pendingRequests, setPendingRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Create Community Modal
    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newCommName, setNewCommName] = useState('');
    const [newCommDesc, setNewCommDesc] = useState('');
    const [newCommScope, setNewCommScope] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');

    // Add Member Modal
    const [memberModalVisible, setMemberModalVisible] = useState(false);
    const [selectedCommId, setSelectedCommId] = useState<string | null>(null);
    const [memberIdentifier, setMemberIdentifier] = useState('');
    const [addingMember, setAddingMember] = useState(false);

    // New Add Member States
    const COUNTRIES = [
        { code: '+91', country: 'India', flag: '🇮🇳' },
        { code: '+1', country: 'USA/Canada', flag: '🇺🇸' },
        { code: '+44', country: 'UK', flag: '🇬🇧' },
        { code: '+61', country: 'Australia', flag: '🇦🇺' },
        { code: '+971', country: 'UAE', flag: '🇦🇪' },
        { code: '+65', country: 'Singapore', flag: '🇸🇬' },
    ];
    const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
    const [showCountryPicker, setShowCountryPicker] = useState(false);
    const [missingUsers, setMissingUsers] = useState<string[]>([]);
    
    // Contact picker states
    const [contactModalVisible, setContactModalVisible] = useState(false);
    const [contactSearchQuery, setContactSearchQuery] = useState('');
    const [contactsList, setContactsList] = useState<Contacts.Contact[]>([]);
    const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
    const [loadingContacts, setLoadingContacts] = useState(false);

    // Join request loading state per community
    const [joiningId, setJoiningId] = useState<string | null>(null);

    useFocusEffect(
        useCallback(() => {
            fetchMyComms();
            fetchPendingRequests();
        }, [])
    );

    const fetchMyComms = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/users/me/communities`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const text = await res.text();
            if (!res.ok) throw new Error(`Server error ${res.status}`);
            const data = JSON.parse(text);
            setMyComms(Array.isArray(data) ? data : []);
        } catch (e: any) {
            console.log('Fetch comms error:', e.message);
            setMyComms([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchPendingRequests = async () => {
        try {
            const res = await fetch(`${API_URL}/users/me/pending-requests`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) return;
            const data = await res.json();
            setPendingRequests(Array.isArray(data) ? data : []);
        } catch (e) {
            console.log('Pending requests error:', e);
        }
    };

    const handleSearchCommunities = async () => {
        if (!searchQuery.trim()) return;
        setSearchLoading(true);
        try {
            const res = await fetch(`${API_URL}/communities/search?q=${encodeURIComponent(searchQuery)}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const text = await res.text();
            if (!res.ok) {
                let msg = 'Search failed';
                try { msg = JSON.parse(text).error || msg; } catch {}
                throw new Error(msg);
            }
            const data = JSON.parse(text);
            setSearchResults(Array.isArray(data) ? data : []);
        } catch (e: any) {
            showAlert('Search Error', e.message);
        } finally {
            setSearchLoading(false);
        }
    };

    const handleJoinRequest = async (commId: string) => {
        setJoiningId(commId);
        try {
            const res = await fetch(`${API_URL}/communities/${commId}/join-request`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to send request');
            showAlert('Request Sent', 'Your join request has been sent to the community admin.');
            handleSearchCommunities();
        } catch (e: any) {
            showAlert('Error', e.message);
        } finally {
            setJoiningId(null);
        }
    };

    const handleRespondToRequest = async (commId: string, userId: string, action: 'ACCEPT' | 'REJECT') => {
        try {
            const res = await fetch(`${API_URL}/communities/${commId}/members/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ action })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            showAlert('Done', action === 'ACCEPT' ? 'Member accepted!' : 'Request rejected.');
            fetchPendingRequests();
            fetchMyComms();
        } catch (e: any) {
            showAlert('Error', e.message);
        }
    };

    const handleCreate = async () => {
        if (!newCommName.trim()) {
            showAlert('Required', 'Please enter a community name.');
            return;
        }
        setCreating(true);
        try {
            const res = await fetch(`${API_URL}/communities`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name: newCommName.trim(), description: newCommDesc.trim(), scope: newCommScope })
            });
            const text = await res.text();
            if (!res.ok) {
                let msg = 'Failed to create community';
                try { msg = JSON.parse(text).error || msg; } catch {}
                throw new Error(msg);
            }
            setNewCommName(''); setNewCommDesc(''); setNewCommScope('PUBLIC');
            setCreateModalVisible(false);
            fetchMyComms();
            showAlert('Success', 'Community created successfully!');
        } catch (e: any) {
            showAlert('Error', e.message);
        } finally {
            setCreating(false);
        }
    };

    const handleAddMemberBulk = async (phones: string[]) => {
        if (!selectedCommId || phones.length === 0) return;
        setAddingMember(true);
        try {
            const res = await fetch(`${API_URL}/communities/${selectedCommId}/members/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ identifiers: phones })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to add members');
            
            if (data.notFound && data.notFound.length > 0) {
                setMissingUsers(data.notFound);
            } else {
                setMemberModalVisible(false);
                setMemberIdentifier('');
            }
            fetchMyComms();
            if (data.added && data.added.length > 0) showAlert('Success', `Added ${data.added.length} members!`);
            else if (!data.notFound || data.notFound.length === 0) showAlert('Info', 'Selected users were already in the community.');
        } catch (e: any) {
            showAlert('Error', e.message);
        } finally {
            setAddingMember(false);
        }
    };

    const handleManualAdd = () => {
        if (!memberIdentifier.trim()) return;
        const phone = (selectedCountry.code + memberIdentifier).replace(/\s+/g, '');
        handleAddMemberBulk([phone]);
    };

    const loadContacts = async () => {
        setLoadingContacts(true);
        const { status } = await Contacts.requestPermissionsAsync();
        if (status === 'granted') {
            const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });
            if (data.length > 0) {
                // Filter contacts with phone numbers
                const validContacts = data.filter(c => c.phoneNumbers && c.phoneNumbers.length > 0);
                setContactsList(validContacts);
                setContactModalVisible(true);
            } else {
                showAlert('Info', 'No contacts found.');
            }
        } else {
            showAlert('Error', 'Contacts permission denied.');
        }
        setLoadingContacts(false);
    };

    const toggleContactSelection = (phone: string) => {
        const newSet = new Set(selectedContacts);
        if (newSet.has(phone)) newSet.delete(phone);
        else newSet.add(phone);
        setSelectedContacts(newSet);
    };

    const submitContacts = () => {
        const phones = Array.from(selectedContacts).map(p => p.replace(/[^0-9+]/g, ''));
        setContactModalVisible(false);
        setSelectedContacts(new Set());
        if (phones.length > 0) {
            handleAddMemberBulk(phones);
        }
    };

    const handleSendInviteSMS = async () => {
        const isAvailable = await SMS.isAvailableAsync();
        if (isAvailable && missingUsers.length > 0) {
            const link = `https://findmate.vercel.app/join/${selectedCommId}`;
            await SMS.sendSMSAsync(
                missingUsers,
                `Hey! Join my community on FindMate to stay updated. Download the app here: ${link}`
            );
            setMissingUsers([]);
            setMemberModalVisible(false);
            setMemberIdentifier('');
        } else {
            showAlert('Error', 'SMS is not available on this device');
        }
    };

    const handleCopyLink = async () => {
        const link = `https://findmate.vercel.app/join/${selectedCommId}`;
        await Clipboard.setStringAsync(link);
        showAlert('Copied!', 'Community invite link copied to clipboard.');
    };

    const handleShareLink = async () => {
        const link = `https://findmate.vercel.app/join/${selectedCommId}`;
        try {
            await Share.share({
                message: `Join my community on FindMate: ${link}`,
                url: link,
                title: 'Share Community Invite Link'
            });
        } catch (e) {
            console.log(e);
        }
    };

    const renderMyCommunity = ({ item }: { item: any }) => {
        const memberCount = item.members?.filter((m: any) => m.role !== 'PENDING').length || 0;
        const pendingCount = item.members?.filter((m: any) => m.role === 'PENDING').length || 0;
        const isAdmin = item.members?.some((m: any) => m.userId && m.role === 'ADMIN');
        const isPrivate = item.scope === 'PRIVATE';

        return (
            <TouchableOpacity
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push(`/account/community/${item.id}`)}
                activeOpacity={0.85}
            >
                <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={[styles.commName, { color: colors.text }]}>{item.name}</Text>
                            {isPrivate ? (
                                <View style={[styles.scopeBadge, { backgroundColor: colors.warning + '20' }]}>
                                    <Lock size={10} color={colors.warning} />
                                    <Text style={{ color: colors.warning, fontSize: 10, fontWeight: '700', marginLeft: 3 }}>Private</Text>
                                </View>
                            ) : (
                                <View style={[styles.scopeBadge, { backgroundColor: colors.primary + '15' }]}>
                                    <Globe size={10} color={colors.primary} />
                                    <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '700', marginLeft: 3 }}>Public</Text>
                                </View>
                            )}
                        </View>
                        {item.organization && (
                            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                                📁 {item.organization.name}
                            </Text>
                        )}
                        {item.description ? (
                            <Text style={[styles.desc, { color: colors.textSecondary }]}>{item.description}</Text>
                        ) : null}
                    </View>
                    {isAdmin && (
                        <TouchableOpacity
                            style={[styles.iconBtn, { backgroundColor: colors.primary + '20' }]}
                            onPress={() => { setSelectedCommId(item.id); setMemberIdentifier(''); setMemberModalVisible(true); }}
                        >
                            <UserPlus size={16} color={colors.primary} />
                        </TouchableOpacity>
                    )}
                </View>
                <View style={styles.statsRow}>
                    <View style={[styles.statBadge, { backgroundColor: colors.background }]}>
                        <Users size={12} color={colors.textSecondary} />
                        <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 4 }}>{memberCount} members</Text>
                    </View>
                    {pendingCount > 0 && isAdmin && (
                        <TouchableOpacity
                            style={[styles.statBadge, { backgroundColor: colors.warning + '20' }]}
                            onPress={() => setActiveTab('REQUESTS')}
                        >
                            <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '600' }}>⏳ {pendingCount} pending</Text>
                        </TouchableOpacity>
                    )}
                    <View style={{ flex: 1 }} />
                    <ChevronRight size={16} color={colors.textSecondary} />
                </View>
            </TouchableOpacity>
        );
    };

    const renderSearchResult = ({ item }: { item: any }) => {
        // Backend now sends myRole (null = not a member) and memberCount
        const myRole: string | null = item.myRole ?? item.members?.[0]?.role ?? null;
        const isMember = myRole === 'MEMBER' || myRole === 'ADMIN';
        const isPending = myRole === 'PENDING';
        const memberCount = item.memberCount ?? item._count?.members ?? 0;
        const isJoining = joiningId === item.id;

        return (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.commName, { color: colors.text }]}>{item.name}</Text>
                {item.organization && <Text style={[styles.subtitle, { color: colors.textSecondary }]}>📁 {item.organization.name}</Text>}
                {item.description ? <Text style={[styles.desc, { color: colors.textSecondary }]}>{item.description}</Text> : null}

                <View style={[styles.statsRow, { marginTop: 10 }]}>
                    {/* Member count */}
                    <View style={[styles.statBadge, { backgroundColor: colors.background }]}>
                        <Users size={12} color={colors.textSecondary} />
                        <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 4 }}>{memberCount} members</Text>
                    </View>

                    {/* Status / Action */}
                    {isMember ? (
                        <View style={[styles.statBadge, { backgroundColor: colors.success + '20' }]}>
                            <CheckCircle size={12} color={colors.success} />
                            <Text style={{ color: colors.success, fontSize: 12, fontWeight: '700', marginLeft: 4 }}>Member</Text>
                        </View>
                    ) : isPending ? (
                        <View style={[styles.statBadge, { backgroundColor: colors.warning + '20' }]}>
                            <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '600' }}>⏳ Request Sent</Text>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={[styles.joinBtn, { backgroundColor: isJoining ? colors.primary + '80' : colors.primary }]}
                            onPress={() => handleJoinRequest(item.id)}
                            disabled={isJoining}
                        >
                            <UserPlus size={13} color="white" />
                            <Text style={{ color: 'white', fontSize: 12, fontWeight: '700', marginLeft: 5 }}>
                                {isJoining ? 'Sending...' : 'Request to Join'}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    };

    const renderPendingRequest = ({ item }: { item: any }) => (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.commName, { color: colors.text }]}>{item.user?.name || item.user?.email}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>wants to join {item.community?.name}</Text>
            <View style={[styles.statsRow, { marginTop: 12 }]}>
                <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.success }]}
                    onPress={() => handleRespondToRequest(item.communityId, item.userId, 'ACCEPT')}
                >
                    <CheckCircle size={14} color="white" />
                    <Text style={{ color: 'white', fontWeight: '600', marginLeft: 6 }}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.error }]}
                    onPress={() => handleRespondToRequest(item.communityId, item.userId, 'REJECT')}
                >
                    <XCircle size={14} color="white" />
                    <Text style={{ color: 'white', fontWeight: '600', marginLeft: 6 }}>Reject</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>

            {/* Tabs */}
            <View style={[styles.tabBar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                {(['MY', 'JOIN', 'REQUESTS'] as TabType[]).map(tab => (
                    <TouchableOpacity
                        key={tab}
                        style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary }]}
                        onPress={() => setActiveTab(tab)}
                    >
                        <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.textSecondary }]}>
                            {tab === 'MY' ? 'My Communities' : tab === 'JOIN' ? 'Find & Join' : `Requests${pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}`}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Create Community Modal */}
            <Modal visible={createModalVisible} transparent animationType="slide" onRequestClose={() => setCreateModalVisible(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                            <View style={styles.modalHeader}>
                                <Text style={[styles.modalTitle, { color: colors.text }]}>Create Community</Text>
                                <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                                    <X size={20} color={colors.textSecondary} />
                                </TouchableOpacity>
                            </View>
                            <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
                                Create a group to share lost & found alerts with specific people.
                            </Text>
                            <TextInput
                                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                                placeholder="Community Name *"
                                placeholderTextColor={colors.textSecondary}
                                value={newCommName}
                                onChangeText={setNewCommName}
                                autoFocus
                                returnKeyType="next"
                            />
                            <TextInput
                                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                                placeholder="Description (Optional)"
                                placeholderTextColor={colors.textSecondary}
                                value={newCommDesc}
                                onChangeText={setNewCommDesc}
                                returnKeyType="done"
                            />

                            {/* Scope selector */}
                            <Text style={[styles.scopeLabel, { color: colors.text }]}>Community Visibility</Text>
                            <View style={styles.scopeRow}>
                                <TouchableOpacity
                                    style={[styles.scopeOption, {
                                        borderColor: newCommScope === 'PUBLIC' ? colors.primary : colors.border,
                                        backgroundColor: newCommScope === 'PUBLIC' ? colors.primary + '12' : colors.background
                                    }]}
                                    onPress={() => setNewCommScope('PUBLIC')}
                                >
                                    <Globe size={18} color={newCommScope === 'PUBLIC' ? colors.primary : colors.textSecondary} />
                                    <View style={{ marginLeft: 8, flex: 1 }}>
                                        <Text style={{ color: newCommScope === 'PUBLIC' ? colors.primary : colors.text, fontWeight: '700', fontSize: 13 }}>Public</Text>
                                        <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>Anyone can search & request to join</Text>
                                    </View>
                                    {newCommScope === 'PUBLIC' && <CheckCircle size={16} color={colors.primary} />}
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.scopeOption, {
                                        borderColor: newCommScope === 'PRIVATE' ? colors.warning : colors.border,
                                        backgroundColor: newCommScope === 'PRIVATE' ? colors.warning + '12' : colors.background
                                    }]}
                                    onPress={() => setNewCommScope('PRIVATE')}
                                >
                                    <Lock size={18} color={newCommScope === 'PRIVATE' ? colors.warning : colors.textSecondary} />
                                    <View style={{ marginLeft: 8, flex: 1 }}>
                                        <Text style={{ color: newCommScope === 'PRIVATE' ? colors.warning : colors.text, fontWeight: '700', fontSize: 13 }}>Private</Text>
                                        <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>Invite-only, not visible in search</Text>
                                    </View>
                                    {newCommScope === 'PRIVATE' && <CheckCircle size={16} color={colors.warning} />}
                                </TouchableOpacity>
                            </View>

                            <View style={styles.btnRow}>
                                <TouchableOpacity style={[styles.btn, { backgroundColor: colors.border, flex: 1 }]} onPress={() => { setCreateModalVisible(false); setNewCommName(''); setNewCommDesc(''); setNewCommScope('PUBLIC'); }}>
                                    <Text style={{ color: colors.text, textAlign: 'center' }}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary, flex: 1 }]} onPress={handleCreate} disabled={creating}>
                                    <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>{creating ? 'Creating...' : 'Create'}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Add Member Modal */}
            <Modal visible={memberModalVisible} transparent animationType="slide" onRequestClose={() => setMemberModalVisible(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { backgroundColor: colors.surface, maxHeight: '80%' }]}>
                            <View style={styles.modalHeader}>
                                <Text style={[styles.modalTitle, { color: colors.text }]}>Add Members</Text>
                                <TouchableOpacity onPress={() => { setMemberModalVisible(false); setMissingUsers([]); }}>
                                    <X size={20} color={colors.textSecondary} />
                                </TouchableOpacity>
                            </View>

                            {missingUsers.length > 0 ? (
                                <View style={{ paddingVertical: 20 }}>
                                    <Text style={{ color: colors.text, fontSize: 16, marginBottom: 12, fontWeight: 'bold' }}>
                                        {missingUsers.length} people are not on FindMate!
                                    </Text>
                                    <Text style={{ color: colors.textSecondary, marginBottom: 20, lineHeight: 22 }}>
                                        Send them an invite link so they can download the app and join the community automatically.
                                    </Text>
                                    <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary, marginBottom: 10 }]} onPress={handleSendInviteSMS}>
                                        <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600', fontSize: 16 }}>Send Invite via SMS</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.btn, { backgroundColor: colors.border }]} onPress={() => { setMissingUsers([]); setMemberModalVisible(false); }}>
                                        <Text style={{ color: colors.text, textAlign: 'center', fontWeight: '600', fontSize: 16 }}>Skip</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                                    <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
                                        Add members manually or generate an invite link.
                                    </Text>
                                    
                                    <View style={styles.phoneInputContainer}>
                                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Manual Entry</Text>
                                        <View style={[styles.phoneRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                            <TouchableOpacity style={styles.countryPickerButton} onPress={() => setShowCountryPicker(true)}>
                                                <Text style={[styles.countryCodeText, { color: colors.text }]}>{selectedCountry.flag} {selectedCountry.code}</Text>
                                                <ChevronDown size={16} color={colors.textSecondary} style={{ marginLeft: 6 }} />
                                            </TouchableOpacity>
                                            <View style={[styles.divider, { backgroundColor: colors.border }]} />
                                            <TextInput
                                                style={[styles.phoneTextInput, { color: colors.text }]}
                                                placeholder="Phone Number"
                                                placeholderTextColor={colors.textSecondary}
                                                keyboardType="phone-pad"
                                                value={memberIdentifier}
                                                onChangeText={setMemberIdentifier}
                                                onSubmitEditing={handleManualAdd}
                                            />
                                        </View>
                                        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary, marginTop: 4 }]} onPress={handleManualAdd} disabled={addingMember}>
                                            <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>{addingMember ? 'Adding...' : 'Add Number'}</Text>
                                        </TouchableOpacity>
                                    </View>

                                    <View style={{ marginVertical: 20, flexDirection: 'row', alignItems: 'center' }}>
                                        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                                        <Text style={{ marginHorizontal: 10, color: colors.textSecondary, fontWeight: '600' }}>OR</Text>
                                        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                                    </View>

                                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.border, marginBottom: 12, justifyContent: 'center' }]} onPress={loadContacts} disabled={loadingContacts}>
                                        <Users size={20} color={colors.text} style={{ marginRight: 8 }} />
                                        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 16 }}>{loadingContacts ? 'Loading...' : 'Select from Phonebook'}</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary, justifyContent: 'center' }]} onPress={handleShareLink}>
                                        <Share2 size={20} color="white" style={{ marginRight: 8 }} />
                                        <Text style={{ color: 'white', fontWeight: '600', fontSize: 16 }}>Share link to join</Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            )}
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Country Picker Modal */}
            <Modal visible={showCountryPicker} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: colors.surface, height: '60%' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>Select Country</Text>
                            <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                                <X size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={COUNTRIES}
                            keyExtractor={(item) => item.code}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={{ flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' }}
                                    onPress={() => {
                                        setSelectedCountry(item);
                                        setShowCountryPicker(false);
                                    }}
                                >
                                    <Text style={{ fontSize: 24, marginRight: 12 }}>{item.flag}</Text>
                                    <Text style={{ fontSize: 16, color: colors.text, flex: 1 }}>{item.country}</Text>
                                    <Text style={{ fontSize: 16, color: colors.textSecondary }}>{item.code}</Text>
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>

            {/* Contacts Picker Modal */}
            <Modal visible={contactModalVisible} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: colors.surface, height: '80%' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>Select Contacts</Text>
                            <TouchableOpacity onPress={() => setContactModalVisible(false)}>
                                <X size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
                            <TextInput
                                style={{ backgroundColor: colors.background, color: colors.text, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}
                                placeholder="Search contacts..."
                                placeholderTextColor={colors.textSecondary}
                                value={contactSearchQuery}
                                onChangeText={setContactSearchQuery}
                            />
                        </View>
                        <FlatList
                            data={contactsList.filter(c => !contactSearchQuery || (c.name && c.name.toLowerCase().includes(contactSearchQuery.toLowerCase())) || c.phoneNumbers?.[0]?.number?.includes(contactSearchQuery))}
                            keyExtractor={(item, index) => String(index)}
                            renderItem={({ item }) => {
                                const phone = item.phoneNumbers?.[0]?.number || '';
                                if (!phone) return null;
                                const isSelected = selectedContacts.has(phone);
                                return (
                                    <TouchableOpacity
                                        style={{ flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' }}
                                        onPress={() => toggleContactSelection(phone)}
                                    >
                                        <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary : 'transparent', marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
                                            {isSelected && <CheckCircle size={14} color="white" />}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 16, color: colors.text, fontWeight: '500' }}>{item.name}</Text>
                                            <Text style={{ fontSize: 14, color: colors.textSecondary }}>{phone}</Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            }}
                        />
                        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary, marginTop: 12 }]} onPress={submitContacts}>
                            <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600', fontSize: 16 }}>
                                Add {selectedContacts.size} Contacts
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* MY COMMUNITIES TAB */}
            {activeTab === 'MY' && (
                loading ? (
                    <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} size="large" />
                ) : (
                    <>
                        <FlatList
                            data={myComms}
                            renderItem={renderMyCommunity}
                            keyExtractor={item => item.id}
                            contentContainerStyle={styles.list}
                            keyboardShouldPersistTaps="handled"
                            ListEmptyComponent={
                                <View style={styles.empty}>
                                    <Users size={52} color={colors.textSecondary} />
                                    <Text style={[styles.emptyTitle, { color: colors.text }]}>No Communities Yet</Text>
                                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Create a community or find and request to join one.</Text>
                                </View>
                            }
                        />
                        <View style={styles.fab}>
                            <TouchableOpacity style={[styles.fabBtn, { backgroundColor: colors.primary }]} onPress={() => setCreateModalVisible(true)}>
                                <Plus size={20} color="white" />
                                <Text style={{ color: 'white', fontWeight: '700', marginLeft: 8, fontSize: 15 }}>Create Community</Text>
                            </TouchableOpacity>
                        </View>
                    </>
                )
            )}

            {/* FIND & JOIN TAB */}
            {activeTab === 'JOIN' && (
                <View style={{ flex: 1 }}>
                    <View style={[styles.searchBox, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                        <TextInput
                            style={[styles.searchInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                            placeholder="Search public communities by name..."
                            placeholderTextColor={colors.textSecondary}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            returnKeyType="search"
                            onSubmitEditing={handleSearchCommunities}
                        />
                        <TouchableOpacity style={[styles.searchBtn, { backgroundColor: colors.primary }]} onPress={handleSearchCommunities}>
                            <Search size={18} color="white" />
                        </TouchableOpacity>
                    </View>
                    {searchLoading ? (
                        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
                    ) : (
                        <FlatList
                            data={searchResults}
                            renderItem={renderSearchResult}
                            keyExtractor={item => item.id}
                            contentContainerStyle={styles.list}
                            keyboardShouldPersistTaps="handled"
                            ListEmptyComponent={
                                <View style={styles.empty}>
                                    <Search size={48} color={colors.textSecondary} />
                                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Search for a public community by name above</Text>
                                </View>
                            }
                        />
                    )}
                </View>
            )}

            {/* JOIN REQUESTS TAB */}
            {activeTab === 'REQUESTS' && (
                <FlatList
                    data={pendingRequests}
                    renderItem={renderPendingRequest}
                    keyExtractor={item => `${item.communityId}-${item.userId}`}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <CheckCircle size={48} color={colors.textSecondary} />
                            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Pending Requests</Text>
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Join requests from others will appear here.</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    tabBar: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        paddingTop: 4,
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabText: { fontSize: 13, fontWeight: '600' },
    list: { padding: 16, paddingBottom: 160 },
    card: {
        padding: 16,
        borderRadius: 14,
        borderWidth: 1,
        marginBottom: 12,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
    commName: { fontSize: 17, fontWeight: '700' },
    subtitle: { fontSize: 12, marginTop: 3 },
    desc: { fontSize: 13, marginTop: 6, lineHeight: 18 },
    statsRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' },
    statBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
    },
    joinBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 20,
    },
    scopeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
    },
    iconBtn: { padding: 8, borderRadius: 10, marginLeft: 8 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
    fab: { position: 'absolute', bottom: 24, left: 16, right: 16 },
    fabBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 14 },
    searchBox: { flexDirection: 'row', padding: 12, gap: 10, borderBottomWidth: 1 },
    searchInput: { flex: 1, height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 14 },
    searchBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    input: { height: 50, borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, marginBottom: 12, fontSize: 15 },
    btnRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
    btn: { paddingVertical: 12, borderRadius: 10 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    modalContent: { padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, width: '100%', maxWidth: 600, alignSelf: 'center' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    modalTitle: { fontSize: 20, fontWeight: 'bold' },
    modalSub: { fontSize: 14, marginBottom: 16, lineHeight: 20 },
    scopeLabel: { fontSize: 14, fontWeight: '600', marginBottom: 10 },
    scopeRow: { gap: 10, marginBottom: 16 },
    scopeOption: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1.5 },
    empty: { alignItems: 'center', paddingTop: 70, gap: 12 },
    emptyTitle: { fontSize: 18, fontWeight: '700' },
    emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
    phoneInputContainer: { gap: 8, marginBottom: 8 },
    inputLabel: { fontSize: 14, fontWeight: '500', marginLeft: 4 },
    phoneRow: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, height: 56, alignItems: 'center', overflow: 'hidden' },
    countryPickerButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: '100%' },
    countryCodeText: { fontSize: 16, fontWeight: '500' },
    divider: { width: 1, height: '60%' },
    phoneTextInput: { flex: 1, fontSize: 16, paddingHorizontal: 16, height: '100%' },
});

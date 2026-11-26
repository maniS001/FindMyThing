import { useLocalSearchParams, useRouter } from 'expo-router';
import { Calendar, ChevronRight, MapPin } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../../components/Button';
import Card from '../../components/Card';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { addComplaint, Item, aiSearchItems } from '../../store';

export default function SearchResults() {
    const params = useLocalSearchParams<{
        name: string;
        category: string;
        location: string;
        date: string;
        description: string;
        contactInfo: string;
        exposePhoneNumber: string;
        latitude: string;
        longitude: string;
        imageUris: string;
        cashPrize: string;
        notifyRadius: string;
        targetCommunityId: string;
        targetOrganizationId: string;
    }>();
    const router = useRouter();
    const { colors } = useTheme();
    const { user } = useAuth();
    const { width } = useWindowDimensions();
    const numColumns = width >= 600 ? 2 : 1;
    const [results, setResults] = useState<Item[]>([]);
    const [loading, setLoading] = useState(false);
    const [filing, setFiling] = useState(false);

    useEffect(() => {
        const fetchResults = async () => {
            if (params.name) {
                setLoading(true);
                try {
                    const items = await aiSearchItems({
                        name: params.name.trim(),
                        category: params.category,
                        location: params.location?.trim(),
                        description: params.description?.trim(),
                    });
                    setResults(items);
                } finally {
                    setLoading(false);
                }
            }
        };
        fetchResults();
    }, [params.name]);

    const handleFileComplaint = async () => {
        if (!params.name || !params.location) {
            Alert.alert('Missing Information', 'Please go back and fill in required fields (item name, location).');
            return;
        }

        setFiling(true);
        try {
            // Parse image URIs from params
            const imageUris = params.imageUris ? JSON.parse(params.imageUris) : [];

            // Convert images to base64
            const { convertImagesToBase64 } = await import('../../utils/imageUtils');
            const base64Images = imageUris.length > 0
                ? await convertImagesToBase64(imageUris)
                : [];

            await addComplaint({
                name: params.name,
                category: params.category || '',
                location: params.location,
                date: params.date || new Date().toISOString().split('T')[0],
                description: params.description || '',
                contactInfo: params.contactInfo?.trim() || undefined,
                exposePhoneNumber: params.exposePhoneNumber === 'true' && Boolean(params.contactInfo?.trim()),
                latitude: params.latitude ? parseFloat(params.latitude) : undefined,
                longitude: params.longitude ? parseFloat(params.longitude) : undefined,
                imageUris: base64Images,
                userId: user?.id,
                cashPrize: params.cashPrize?.trim() || undefined,
                notifyRadius: params.notifyRadius ? parseInt(params.notifyRadius) : undefined,
                targetCommunityId: params.targetCommunityId || undefined,
                targetOrganizationId: params.targetOrganizationId || undefined,
            });
            router.push({
                pathname: '/success',
                params: { type: 'complaint' }
            });
        } catch (error) {
            Alert.alert('Error', 'Failed to file complaint. Please try again.');
        } finally {
            setFiling(false);
        }
    };

    const renderItem = ({ item }: { item: Item }) => {
        let imageUris: string[] = [];
        try {
            if (Array.isArray(item.imageUris)) {
                imageUris = item.imageUris;
            } else if (typeof item.imageUris === 'string') {
                // Try to parse if it looks like JSON array
                const uriString = item.imageUris as string;
                if (uriString.startsWith('[')) {
                    const parsed = JSON.parse(uriString);
                    if (Array.isArray(parsed)) imageUris = parsed;
                } else {
                    imageUris = [uriString];
                }
            }

            // Fallback to imageUri if imageUris is empty
            if (imageUris.length === 0 && item.imageUri) {
                imageUris = [item.imageUri];
            }
        } catch (e) {
            console.log('Error parsing images:', e);
            if (item.imageUri) imageUris = [item.imageUri];
        }

        return (
            <TouchableOpacity
                onPress={() => router.push(`/victim/claim/${item.id}`)}
                activeOpacity={0.9}
                style={styles.cardWrapper}
            >
                <Card style={styles.itemCard}>
                    {imageUris.length > 0 ? (
                        <View style={[styles.itemImage, styles.noImagePlaceholder, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 24, marginBottom: 4 }}>🔒</Text>
                                <Text style={[styles.noImageText, { color: colors.textSecondary, textAlign: 'center' }]}>
                                    Image hidden for security
                                </Text>
                            </View>
                        </View>
                    ) : (
                        <View style={[styles.itemImage, styles.noImagePlaceholder, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Text style={[styles.noImageText, { color: colors.textSecondary }]}>No Image</Text>
                        </View>
                    )}

                    <View style={styles.itemHeader}>
                        <Text style={[styles.itemName, { color: colors.text }]}>{item.name}</Text>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>Found</Text>
                        </View>
                    </View>

                    <View style={styles.row}>
                        <MapPin size={16} color={colors.textSecondary} />
                        <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>{item.location}</Text>
                    </View>

                    <View style={styles.row}>
                        <Calendar size={16} color={colors.textSecondary} />
                        <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>{item.date}</Text>
                    </View>

                    <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
                        {item.description}
                    </Text>

                    <View style={[styles.footer, { borderTopColor: colors.border }]}>
                        <Text style={[styles.claimText, { color: colors.primary }]}>Tap to Claim</Text>
                        <ChevronRight size={20} color={colors.primary} />
                    </View>
                </Card>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
            <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                <Text style={[styles.title, { color: colors.text }]}>Results for "{params.name}"</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{results.length} items found</Text>
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Searching for items...</Text>
                </View>
            ) : (
                <FlatList
                    data={results}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    key={numColumns}
                    numColumns={numColumns}
                    contentContainerStyle={styles.list}
                    columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No items found matching your search.</Text>
                        </View>
                    }
                />
            )}

            <View style={[styles.complainButtonContainer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                <Text style={[styles.complainHint, { color: colors.text }]}>
                    {results.length > 0
                        ? "Didn't find your item in the list above?"
                        : "No matches found?"}
                </Text>
                <Button
                    title="File a Complaint"
                    onPress={handleFileComplaint}
                    loading={filing}
                    variant="secondary"
                />
                <Text style={[styles.complainSubtext, { color: colors.textSecondary }]}>
                    We'll notify you if someone reports finding a matching item
                </Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        padding: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
    },
    subtitle: {
        fontSize: 14,
        marginTop: 4,
    },
    list: {
        padding: 24,
        gap: 16,
    },
    cardWrapper: {
        flex: 1,
    },
    columnWrapper: {
        gap: 16,
    },
    itemImage: {
        width: '100%',
        aspectRatio: 4 / 3,
        borderRadius: 8,
        marginBottom: 12,
        backgroundColor: '#F1F5F9',
    },
    itemCard: {
        gap: 8,
        flex: 1,
    },
    itemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    itemName: {
        fontSize: 18,
        fontWeight: '600',
    },
    badge: {
        backgroundColor: '#DCFCE7',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    badgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#166534',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    itemMeta: {
        fontSize: 14,
    },
    description: {
        fontSize: 14,
        marginTop: 4,
        lineHeight: 20,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: 8,
        paddingTop: 12,
        borderTopWidth: 1,
    },
    claimText: {
        fontSize: 14,
        fontWeight: '600',
        marginRight: 4,
    },
    emptyState: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 16,
        textAlign: 'center',
    },
    complainButtonContainer: {
        padding: 24,
        borderTopWidth: 1,
    },
    complainHint: {
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: 12,
    },
    complainSubtext: {
        fontSize: 13,
        textAlign: 'center',
        marginTop: 8,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
    },
    noImagePlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderStyle: 'dashed',
    },
    noImageText: {
        fontSize: 14,
        fontWeight: '600',
    },
});

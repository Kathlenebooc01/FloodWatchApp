import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const SUBJECT_GROUPS = [
    { title: 'Flood & Weather', icon: 'rainy-outline', options: ['Flooding Situation Update', 'Heavy Rainfall Monitoring', 'River & Water Level Monitoring', 'Flash Flood Assessment', 'Storm Surge Situation Update', 'Typhoon Preparedness Update'] },
    { title: 'Rescue & Evacuation', icon: 'shield-checkmark-outline', options: ['Rescue Operations Update', 'Evacuation Operations Update', 'Evacuation Center Status', 'Search & Rescue Coordination', 'Stranded Residents Assistance', 'Displaced Families Update'] },
    { title: 'Roads & Infrastructure', icon: 'construct-outline', options: ['Road Clearing Operations', 'Road & Bridge Accessibility', 'Drainage & Canal Clearing', 'Landslide Situation Update', 'Infrastructure Damage Assessment', 'Power & Utilities Status'] },
    { title: 'Relief & Resources', icon: 'cube-outline', options: ['Relief Goods Distribution', 'Food & Drinking Water Supply', 'Emergency Resource Requirements', 'Rescue Equipment Availability', 'Relief Delivery Coordination', 'Shelter & Temporary Housing'] },
    { title: 'Health & Safety', icon: 'medkit-outline', options: ['Medical Assistance Update', 'Public Health & Sanitation', 'Injured Residents Update', 'Vulnerable Residents Assistance', 'Community Safety Advisory', 'Waterborne Disease Monitoring'] },
    { title: 'Recovery & Coordination', icon: 'people-outline', options: ['Damage & Needs Assessment', 'Post Disaster Recovery Update', 'LGU Response Coordination', 'Barangay Situation Summary', 'Volunteer Deployment Update', 'Community Cleanup Operations'] },
] as const;

type Props = { selected: string; onSelect: (subject: string) => void; onClose: () => void };
export function ReportSubjectPicker({ selected, onSelect, onClose }: Props) {
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('All');
    const groups = SUBJECT_GROUPS.filter(group => category === 'All' || group.title === category)
        .map(group => ({ ...group, options: group.options.filter(option => `${group.title} ${option}`.toLowerCase().includes(search.trim().toLowerCase())) }))
        .filter(group => group.options.length > 0);
    return <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <SafeAreaView edges={['bottom']} style={s.sheet}>
                <View style={s.handle} />
                <View style={s.header}>
                    <View style={s.headerIcon}><Ionicons name="clipboard-outline" size={23} color="#0954E8" /></View>
                    <View style={{ flex: 1 }}><Text style={s.heading}>Choose a Subject</Text><Text style={s.subtitle}>What is your situational update about?</Text></View>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close subject picker" style={s.close} onPress={onClose}><Ionicons name="close" size={21} color="#64748B" /></TouchableOpacity>
                </View>
                <View style={s.search}><Ionicons name="search" size={19} color="#64748B" /><TextInput accessibilityLabel="Search report subjects" style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search subjects..." placeholderTextColor="#94A3B8" /></View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categories} style={{ flexGrow: 0, flexShrink: 0, height: 60 }}>
                    {['All', ...SUBJECT_GROUPS.map(group => group.title)].map(item => <TouchableOpacity key={item} accessibilityRole="button" accessibilityState={{ selected: category === item }} onPress={() => setCategory(item)} style={[s.chip, category === item && s.activeChip]}><Text style={[s.chipText, category === item && s.activeChipText]}>{item}</Text></TouchableOpacity>)}
                </ScrollView>
                <ScrollView style={{ flex: 1, minHeight: 0 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
                    {groups.map(group => <View key={group.title} style={s.group}>
                        <View style={s.groupHeader}><Ionicons name={group.icon} size={16} color="#64748B" /><Text style={s.groupTitle}>{group.title.toUpperCase()}</Text></View>
                        <View style={s.optionGroup}>{group.options.map((option, index) => <TouchableOpacity key={option} accessibilityRole="button" accessibilityState={{ selected: selected === option }} onPress={() => onSelect(option)} style={[s.option, index > 0 && s.optionDivider, selected === option && s.selectedOption]}>
                            <Text style={[s.optionText, selected === option && s.selectedText]}>{option}</Text><Ionicons name={selected === option ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={selected === option ? '#0954E8' : '#CBD5E1'} />
                        </TouchableOpacity>)}</View>
                    </View>)}
                    {!groups.length && <View style={s.empty}><Ionicons name="search-outline" size={30} color="#94A3B8" /><Text style={s.optionText}>No matching subjects</Text><Text style={s.subtitle}>Choose Other below to write your own.</Text></View>}
                </ScrollView>
                <View style={s.footer}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Other - write your own subject" accessibilityState={{ selected: selected === 'Other' }} style={s.other} onPress={() => onSelect('Other')}>
                    <View style={s.otherIcon}><Ionicons name="create-outline" size={22} color="#0954E8" /></View><View style={{ flex: 1 }}><Text style={s.otherTitle}>Other</Text><Text style={s.subtitle}>Write your own title or subject</Text></View><Ionicons name={selected === 'Other' ? 'checkmark-circle' : 'arrow-forward'} size={21} color="#0954E8" />
                </TouchableOpacity></View>
            </SafeAreaView>
        </KeyboardAvoidingView>
    </Modal>;
}
const s = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.5)' },
    sheet: { height: '90%', maxHeight: '90%', width: '100%', maxWidth: 640, alignSelf: 'center', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#FFF', overflow: 'hidden' },
    handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#D7E1F3', alignSelf: 'center', marginTop: 10, marginBottom: 18 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 18 },
    headerIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#EAF0FF', alignItems: 'center', justifyContent: 'center' },
    heading: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
    subtitle: { fontSize: 12, lineHeight: 18, color: '#64748B', marginTop: 3 },
    close: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
    search: { marginHorizontal: 20, paddingHorizontal: 12, gap: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F7FB', borderWidth: 1, borderColor: '#E7ECF5', borderRadius: 12 },
    searchInput: { flex: 1, height: 46, color: '#0F172A', fontSize: 14 },
    categories: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
    chip: { backgroundColor: '#F1F5F9', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20 },
    activeChip: { backgroundColor: '#0954E8' },
    chipText: { color: '#64748B', fontSize: 11, fontWeight: '600' },
    activeChipText: { color: '#FFF' },
    content: { paddingHorizontal: 20, paddingBottom: 18, gap: 20 },
    group: { gap: 10 },
    groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    groupTitle: { fontSize: 10, letterSpacing: 0.8, color: '#64748B', fontWeight: '700' },
    optionGroup: { borderWidth: 1, borderColor: '#E7ECF5', borderRadius: 16, overflow: 'hidden' },
    option: { minHeight: 52, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
    optionDivider: { borderTopWidth: 1, borderColor: '#EDF1F6' },
    optionText: { flex: 1, fontSize: 13, color: '#334155', fontWeight: '500', lineHeight: 19 },
    selectedOption: { backgroundColor: '#EFF4FF' },
    selectedText: { color: '#0954E8', fontWeight: '700' },
    footer: { flexShrink: 0, padding: 16, borderTopWidth: 1, borderColor: '#EDF1F6' },
    other: { padding: 13, backgroundColor: '#F3F6FF', borderWidth: 1, borderColor: '#C9D9FE', borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
    otherIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E1EAFF', alignItems: 'center', justifyContent: 'center' },
    otherTitle: { color: '#0954E8', fontWeight: '700', fontSize: 14 },
    empty: { paddingVertical: 24, alignItems: 'center', gap: 10 },
});

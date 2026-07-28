import { BlurView } from 'expo-blur';
import React from 'react';
import {
    StyleSheet,
    View,
} from 'react-native';
import WaveLoader from '../loader/WaveLoader';

export default function LoadingScreen() {
    return (
        <View style={styles.overlay}>
            <BlurView intensity={20} style={styles.blurContainer}>
                <View style={styles.loaderWrapper}>
                    {/* Big Wave Loader in the center */}
                    <WaveLoader />
                </View>
            </BlurView>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 9999,
    },
    blurContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.4)',
    },
    loaderWrapper: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 30,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
    },
});

import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export default function WaveLoader() {
    const waveAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.timing(waveAnim, {
                toValue: 100,
                duration: 2000,
                easing: Easing.linear,
                useNativeDriver: false,
            })
        ).start();
    }, []);

    const strokeDashoffset = waveAnim.interpolate({
        inputRange: [0, 100],
        outputRange: [100, 0],
    });

    return (
        <Svg
            width={200}
            height={120}
            viewBox="0 0 48 48"
            fill="none"
        >
            {/* Background Outline (Gray) */}
            <Path
                d="M 4 24 Q 9 12 14 24 T 24 24 T 34 24 T 44 24"
                stroke="#E5E7EB"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
            />

            {/* Running Color inside the Outline (Blue) */}
            <AnimatedPath
                d="M 4 24 Q 9 12 14 24 T 24 24 T 34 24 T 44 24"
                stroke="#0d57d9"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="40, 60"
                strokeDashoffset={strokeDashoffset}
            />
        </Svg>
    );
}

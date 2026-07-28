import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Line, Polygon, Path } from 'react-native-svg';

export default function BoatLoader() {
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.2,
                    duration: 1000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, []);

    return (
        <Animated.View
            style={{
                transform: [{ scale: pulseAnim }],
                justifyContent: 'center',
                alignItems: 'center',
                padding: 4,
            }}
        >
            <Svg
                width={60}
                height={50}
                viewBox="0 0 48 40"
                fill="none"
            >
                {/* Flag Pole */}
                <Line
                    x1="24"
                    y1="2"
                    x2="24"
                    y2="24"
                    stroke="#0d57d9"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />

                {/* Flag (Right-pointing half triangle) */}
                <Polygon
                    points="24,2 38,10 24,18"
                    fill="#0d57d9"
                    stroke="#0d57d9"
                    strokeWidth="3"
                    strokeLinejoin="round"
                />

                {/* Boat Body (Crescent / Half Circle) */}
                <Path
                    d="M2 24 A 22 14 0 0 0 46 24 Z"
                    fill="none"
                    stroke="#0d57d9"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </Svg>
        </Animated.View>
    );
}

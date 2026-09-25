const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'app');

function processDir(directory) {
    fs.readdirSync(directory).forEach(file => {
        const fullPath = path.join(directory, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.tsx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            
            // Check if SafeAreaView is imported from react-native
            const rnImportRegex = /(import\s*{[^}]*?)\bSafeAreaView\b\s*,?\s*([^}]*?}\s*from\s*['"]react-native['"])/gs;
            
            if (rnImportRegex.test(content)) {
                // Remove SafeAreaView from react-native import
                content = content.replace(rnImportRegex, '');
                
                // Cleanup double commas or leading/trailing commas in the import
                content = content.replace(/(import\s*{)\s*,/g, '');
                content = content.replace(/,\s*,/g, ',');
                content = content.replace(/,\s*(}\s*from\s*['"]react-native['"])/g, '');
                
                // Add safe-area-context import if not present
                if (!content.includes('react-native-safe-area-context')) {
                    content = "import { SafeAreaView } from 'react-native-safe-area-context';\n" + content;
                }
                
                fs.writeFileSync(fullPath, content);
                console.log('Fixed:', fullPath);
            }
        }
    });
}

processDir(dir);

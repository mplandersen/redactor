/**
 * FileHandler - Browser-only file operations for PII redactor
 * No network calls - GDPR compliant, everything stays in browser
 */

const FileHandler = {
    /**
     * Read a .txt file and return its contents
     * @param {File} file - File object from input element
     * @returns {Promise<string>} - File text content
     */
    readFile(file) {
        return new Promise((resolve, reject) => {
            // Validate file type
            if (!file) {
                reject(new Error('No file provided'));
                return;
            }

            if (!file.name.toLowerCase().endsWith('.txt')) {
                reject(new Error('Only .txt files are supported'));
                return;
            }

            const reader = new FileReader();

            reader.onload = (event) => {
                resolve(event.target.result);
            };

            reader.onerror = () => {
                reject(new Error('Failed to read file: ' + reader.error?.message || 'Unknown error'));
            };

            reader.readAsText(file);
        });
    },

    /**
     * Create and trigger download of file
     * @param {string} content - Text content to download
     * @param {string} filename - Output filename
     */
    downloadFile(content, filename) {
        // Create blob and download link
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;

        // Trigger download
        document.body.appendChild(link);
        link.click();

        // Cleanup
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
};

// Export for module usage if available
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FileHandler;
}

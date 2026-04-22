class Logger {
    static room(roomIndex, message) {
        console.log(`[Комната ${roomIndex + 1}] ${message}`);
    }

    static roomError(roomIndex, message) {
        console.error(`[Комната ${roomIndex + 1}] ${message}`);
    }

    static step(message) {
        console.log(`\n${message}`);
    }

    static progress(current, total, message = '') {
        console.log(`  Прогресс: ${current}/${total} ${message}`);
    }

    static time(message, seconds) {
        console.log(`${message}: ${seconds.toFixed(2)}с`);
    }

    static header(title) {
        console.log('\n' + '='.repeat(60));
        console.log(title);
        console.log('='.repeat(60));
    }

    static subHeader(title) {
        console.log('\n' + '-'.repeat(40));
        console.log(title);
        console.log('-'.repeat(40));
    }

    static info(message) {
        console.log(message);
    }

    static error(message) {
        console.error(`❌ ${message}`);
    }

    static warn(message) {
        console.warn(`⚠️ ${message}`);
    }

    static success(message) {
        console.log(`✅ ${message}`);
    }
}

module.exports = Logger;
/**
 * Performance test script for MQAService debug logging optimization
 * This script demonstrates the difference between verbose logging enabled/disabled
 */

import { MQAService } from '../services/MQAService';

const TEST_RDF_CONTENT = `
@prefix dct: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .

<http://ejemplo.es/catalogo> a dcat:Catalog ;
    dct:title "Catálogo de ejemplo"@es ;
    dct:description "Un catálogo de ejemplo para pruebas"@es ;
    dcat:dataset <http://ejemplo.es/dataset/1> .

<http://ejemplo.es/dataset/1> a dcat:Dataset ;
    dct:title "Dataset de ejemplo"@es ;
    dct:description "Un dataset de ejemplo"@es ;
    dcat:distribution <http://ejemplo.es/distribution/1> .

<http://ejemplo.es/distribution/1> a dcat:Distribution ;
    dct:title "Distribución CSV"@es ;
    dcat:mediaType <https://www.iana.org/assignments/media-types/text/csv> .
`;

async function performanceTest() {
    console.log('Performance Test: MQAService Debug Logging Optimization');
    console.log('=' + '='.repeat(60));
    
    const mqaService = MQAService.getInstance();
    
    // Test 1: With debug logging (should be minimal in production)
    console.log('\nTest 1: Production Mode (DEBUG_ENABLED=false)');
    console.time('Production Mode');
    
    try {
        const result1 = await mqaService.calculateQuality(
            TEST_RDF_CONTENT, 
            'dcat_ap_es', 
            'turtle'
        );
        console.timeEnd('Production Mode');
        console.log(`Quality Score: ${result1.percentage.toFixed(1)}% (${result1.totalScore}/${result1.metrics.reduce((sum: number, m: any) => sum + m.maxScore, 0)} points)`);
    } catch (error) {
        console.timeEnd('Production Mode');
        console.error('Production test failed:', error);
    }
    
    // Test 2: Progressive validation
    console.log('\n🔄 Test 2: Progressive Validation');
    console.time('Progressive Validation');
    
    try {
        const mqaService2 = MQAService.getInstance();
        const result2 = await mqaService2.calculateQualityWithSHACL(
            TEST_RDF_CONTENT,
            'dcat_ap_es',
            'turtle',
            false // Don't skip syntax validation
        );
        console.timeEnd('Progressive Validation');
        console.log(`Final Quality Score: ${result2.quality.percentage.toFixed(1)}%`);
        console.log(`SHACL Conforms: ${result2.shaclReport.conforms}`);
    } catch (error) {
        console.timeEnd('Progressive Validation');
        console.error('Progressive validation test failed:', error);
    }
    
    console.log('\nPerformance Summary:');
    console.log('- Debug logging is controlled by DEBUG_ENABLED flag (development only)');
    console.log('- Verbose logging is disabled by default (VERBOSE_LOGGING=false)');
    console.log('- Progressive validation provides better UX for large datasets');
    console.log('- Performance timing is available in development mode');
}

// Run the test
performanceTest().catch(console.error);

export { performanceTest };
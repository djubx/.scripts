require('dotenv').config({ path: '../.env' });
const { createClient } = require('@sanity/client');
const categoriesData = require('./categories.json');
const { deleteAllCategories, deleteAllSubCategories } = require('./deleteCategories');
const { updateCategories, updateSubCategories } = require('./updateCategories');
const { createCategories, createSubCategories } = require('./createCategories');

const client = createClient({
	projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
	dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
	token: process.env.SANITY_API_TOKEN,
	useCdn: false,
});

function generateRandomKey(length = 8) {
	return Math.random().toString(36).substring(2, length + 2);
}

async function updatePackageSubCategories() {
	try {
		const subCategories = await client.fetch('*[_type == "subCategory"]');
		const packages = await client.fetch('*[_type == "package"]');

		const packageSubCategoryMap = new Map();

		// Create a map of package names to their subcategories
		categoriesData["Flutter Packages"].forEach(category => {
			const [, subCategoriesData] = Object.entries(category)[0];
			subCategoriesData.forEach(subCategory => {
				const [subCategoryName, subCategoryInfo] = Object.entries(subCategory)[0];
				subCategoryInfo.packages.forEach(packageName => {
					packageSubCategoryMap.set(packageName, subCategoryName);
				});
			});
		});

		for (const pkg of packages) {
			const subCategoryName = packageSubCategoryMap.get(pkg.name);
			if (subCategoryName) {
				const subCategory = subCategories.find(sc => sc.name === subCategoryName);
				if (subCategory) {
					await client
						.patch(pkg._id)
						.set({
							subCategories: [{
								_type: 'reference',
								_ref: subCategory._id,
								_key: generateRandomKey()
							}]
						})
						.commit();
					console.log(`Updated subcategory for package: ${pkg.name} with ${subCategoryName}`);
				} else {
					console.log(`Subcategory not found for package: ${pkg.name}`);
				}
			} else {
				console.log(`No subcategory mapping found for package: ${pkg.name}`);
			}
		}

		console.log('All package subcategories updated successfully');
	} catch (error) {
		console.error('Error updating package subcategories:', error);
	}
}

async function listPackagesWithNoSubCategories() {
    try {
        const packages = await client.fetch('*[_type == "package"]');
        // first 5 packages print only _ref
        console.log('Packages:', packages.map(pkg => pkg.subCategories));
        const packagesWithNoSubCategories = packages.filter(pkg => !pkg.subCategories || pkg.subCategories.length === 0);
        console.log('Packages with no subcategories:', packagesWithNoSubCategories.map(pkg => pkg.name));
    } catch (error) {
        console.error('Error listing packages with no subcategories:', error);
    }
}

async function main() {
	console.log('Starting category and subcategory update process...');
	
	try {
        
        // await deleteAllSubCategories();
        // await deleteAllCategories();
		// await createCategories();
		// await createSubCategories();
		// await updateCategories();
		// await updateSubCategories();
		// await updatePackageSubCategories();
        // await deleteAllSubCategories();
        await listPackagesWithNoSubCategories();
		console.log('Category and subcategory update process completed successfully.');
	} catch (error) {
		console.error('Error in main process:', error);
	}
}

main();

const { createClient } = require('@sanity/client');
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

// Initialize the Sanity client
const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
  apiVersion: '2024-08-28', // Use today's date
});

// Function to create a single package
async function createPackage(packageData) {
  try {
    let packageImage = null;
    if (packageData.thumbnail) {
      packageImage = await uploadImageToSanity(packageData.thumbnail);
    }

    const result = await client.create({
      _type: 'package',
      name: packageData.title,
      slug: {
        _type: 'slug',
        current: packageData.title.toLowerCase().replace(/\s+/g, "-").slice(0, 96)
      },
      author: packageData.publisher,
      shortDescription: packageData.description,
      packageImage: packageImage,
      subCategories: [
        {
          _key: "b67722e94ec1",
          _ref: "7a9c3d73-c421-49a9-9b16-2f3b4a96416c",
          _type: "reference"
        }
      ],
      platforms: packageData.platform_data.map(platform => platform.toLowerCase()),
      lastUpdate: new Date(packageData.last_update).toISOString(),
      likesCount: parseInt(packageData.likes),
      pubPoint: parseInt(packageData.points),
      tutorialIncluded: true,
      tags: packageData.hashtags,
      description: packageData.description
    });
    console.log(`Created package with ID: ${result._id}`);
  } catch (error) {
    console.error('Error creating package:', error.message);
    if (error.response) {
      console.error('Response details:', error.response);
    }
  }
}

// Create all packages
async function createAllPackages() {
const packagesData = JSON.parse(fs.readFileSync('packages.json', 'utf8'));
  for (const packageData of packagesData) {
    try {
      await createPackage(packageData);
    } catch (error) {
      console.error('Failed to create package:', packageData.title);
      console.error('Error:', error);
      return; // Stop processing if there's an error
    }
  }
  console.log('All packages created successfully');
}

// Function to scrape package data from pub.dev
async function scrapePackageData(packageName) {
  const url = `https://pub.dev/packages/${packageName}`;
  const response = await axios.get(url);
  const $ = cheerio.load(response.data);

  // Helper function to parse numbers, removing any non-digit characters
  const parseNumber = (str) => {
    const digitsOnly = str.replace(/\D/g, '');
    const halfLength = Math.floor(digitsOnly.length / 2);
    // return parseInt(digitsOnly.slice(0, halfLength)) || 0;
    return digitsOnly.slice(0, halfLength);
  };


  return {
    title: packageName,
    likes: parseNumber($('.packages-score-like .packages-score-value-number').text().trim()),
    points: parseNumber($('.packages-score-health .packages-score-value-number').text().trim()),
    popularity: parseNumber($('.packages-score-popularity .packages-score-value-number').text().trim()),
    description: $('.detail-lead-text').text().trim(),
    thumbnail: 'https://pub.dev/' + ($('.thumbnail-container').data('thumbnail')?.split(',')[0] || $('.detail-image img').attr('src')),
    hashtags: [...new Set($('.title:contains("Topics")').next('p').find('a').map((_, el) => $(el).text().trim()).get())],
    last_update: $('.-x-ago').attr('title') || 'Unknown',
    last_version: $('h1.title').text().match(/(\d+\.\d+\.\d+)/)[1],
    publisher: $('.-pub-publisher').text().trim(),
    dart_3_compatible: $('.package-badge').text().includes('Dart 3 compatible'),
    sdk_data: $('.tag-badge-sub')
      .filter((_, el) => $(el).prev().text().trim() === 'SDK')
      .map((_, el) => $(el).text().trim())
      .get(),
    platform_data: $('.tag-badge-sub')
      .filter((_, el) => $(el).parent().find('.tag-badge-main').text().trim() === 'Platform')
      .map((_, el) => $(el).text().trim())
      .get(),
  };
}

// Function to fetch and append packages to packages.json
async function fetchAndAppendPackages(packageNames) {
  let packagesData = [];
  if (fs.existsSync('packages.json')) {
    packagesData = JSON.parse(fs.readFileSync('packages.json', 'utf8'));
  }

  for (const packageName of packageNames) {
    console.log(`Fetching data for ${packageName}...`);
    const packageData = await scrapePackageData(packageName);
    packagesData.push(packageData);
  }

  fs.writeFileSync('packages.json', JSON.stringify(packagesData, null, 2));
  console.log('packages.json updated successfully');
}

// Export the functions
module.exports = {
  createPackage,
  createAllPackages,
  fetchAndAppendPackages
};

// Only run createAllPackages if this file is being run directly
if (require.main === module) {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  readline.question('Enter package names separated by commas: ', async (input) => {
    const packageNames = input.split(',').map(name => name.trim());
    await fetchAndAppendPackages(packageNames);
    readline.close();
    await createAllPackages();
  });
}

async function uploadImageToSanity(imageUrl) {
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    const asset = await client.assets.upload('image', buffer);
    return {
      _type: 'image',
      asset: { _type: 'reference', _ref: asset._id }
    };
  } catch (error) {
    console.error('Error uploading image:', error);
    return null;
  }
}
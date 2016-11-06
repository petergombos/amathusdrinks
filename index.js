var request = require('request-promise')
var cheerio = require('cheerio')
var Promise = require('bluebird')
var mongoose = require('mongoose')
var Product = require('./Product')
Promise.promisifyAll(mongoose);

var baseUrl = 'http://www.amathusdrinks.com/catalog/seo_sitemap/product/?p='

function getProducts(page){
	return request.get(baseUrl +  page)
	.then(function(results){
		var $ = cheerio.load(results)
		var links = []
		$('.sitemap li a').each(function(i, el){
			links.push($(this).attr('href').toString())
		})
		return links
	})
	.then(function(links){
		return Promise.all(links.map(function(link){
			return request.get(link)
		}))
	})
	.then(function(productPages){
		return productPages.map(function(page){
			return parsePage(page)
		}).filter(function(page){
			return page !== false
		})
	})
}

function parsePage(html){
	var $ = cheerio.load(html)
	var category = $($('.breadcrumbs li')[2]).text().trim().toLowerCase().slice(0, -1)
	var sub_category = $($('.breadcrumbs li')[4]).text().trim().toLowerCase()
	
	if(category === 'corporate gift'){
		return false
	}

	if(category === 'our brand'){
		if(['spirits','wines','liqueurs','beers'].indexOf(sub_category) > -1){
			category = $($('.breadcrumbs li')[4]).text().trim().toLowerCase().slice(0, -1)
		} else {
			category = ''
		}
		sub_category = ''
	}
	
	var measurable = category === 'spirit' || category === 'liqueur' ? true : false

	if(!$('.UnitV').text().split(': ')[1]){
		return false
	}

	var capacity = $('.UnitV').text().split(': ')[1].toLowerCase().split(' ').join('')
	
	try{
		capacity = capacity.match(/\d+(\.?\d+)?\s?[c,m,l]/i)[0]
	} catch(e) {
		try{
			capacity = capacity.match(/\d+(\.?\d+)/i)[0]
		} catch(e){
			console.log(e, capacity, $('.product-header-name h2').text().trim())
		}
		console.log(e, capacity, $('.product-header-name h2').text().trim())
	}
	
	switch (capacity.slice(-1)) {	
		case 'c':
			capacity = capacity.slice(0,-1) * 10
			break
		case 'm':
			capacity = capacity.slice(0,-1)
			break
		case 'l':
			capacity = capacity.slice(0,-1) * 1000
			break
		default:
			capacity = capacity.slice(0,-1) * 10
	}
	
	return {
		name: $('.product-header-name h2').text().trim(),
		type: 'beverage',
		category: category,
		sub_category: sub_category,
		images: {
			thumbnail: $('#zoomimage img').attr('src').replace('/1/image/275x378/','/1/thumbnail/275x/'),
			normal: $('#zoomimage').attr('href')
		},
		capacity: capacity,
		measurable: measurable,
		approved: true,
		sku: $('.sku').text().trim().split(' ')[1]
	} 
}

function saveProducts(page_num) {
	if(page_num === 46){
		return console.log('All saved')
	}
	getProducts(page_num)
	.then(function(products){
		Product.create(products, function(){
			return products
		})
	})
	.then(function(response){
		console.log('Saved page: ' + page_num)
		saveProducts(++page_num)
	})
	.catch(function(err){
		console.log(err)
		saveProducts(++page_num)
	})
}

// connect to mongo db
mongoose.connect('mongodb://localhost/barflow-api-development', { server: { socketOptions: { keepAlive: 1 } } });
mongoose.connection.on('error', function(){
  throw new Error('unable to connect to database: ${config.db}');
})
mongoose.connection.on('connected', function(){
	console.log('connected')
	saveProducts(1)
})





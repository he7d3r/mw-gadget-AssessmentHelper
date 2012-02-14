(function() {

/* Assessment Helper */
mw.messages.set( {
	'ah-check-quality-link': 'Estimar qualidade',
	'ah-check-quality-desc': 'Executa alguns testes automatizados no código wiki' +
		' da página para estimar sua qualidade',
	'ah-check-priority-link': 'Ver prioridade',
	'ah-check-priority-desc': 'Consulta a importância informada na página de' +
		' discussão do artigo correspondente na Wikipédia inglesa',
	'ah-matrix-updater-link': 'Gerar matriz atualizada',
	'ah-matrix-updater-desc': 'Analisa as categorias de qualidade e importância' +
		' do wikiprojeto e gera a versão atualizada do código wiki da' +
		' matriz correspondente',
	'ah-inform-level': 'Estima-se que esta página seja de qualidade $1 conforme' +
		' os <a href="$2">critérios da Wikipédia</a>.',
	'ah-inform-inconsistency': 'Estima-se que esta página seja de qualidade $1' +
		' conforme os <a href="$2">critérios da Wikipédia</a>. No entanto, ela' +
		' não cumpre os critérios para ser de nível $3.',
	'ah-inform-featured-article-inconsistency': 'Confira se ela foi mesmo eleita' +
		' como um artigo destacado.',
	'ah-inform-good-article-inconsistency': 'Confira se ela foi mesmo eleita' +
		' como um artigo bom.',
	'ah-ask-for-update-text': 'Gravar esta avaliação',
	'ah-ask-for-update-title': 'Clique para confirmar que esta página é de' +
		' qualidade $1 e gravar esta informação na discussão',
	'ah-quality-update-summary': 'Atualização: esta página cumpre os' +
		' [[Predefinição:Escala_de_avaliação|requisitos]] para ser de' +
		' [[Wikipédia:Qualidade|qualidade]] $1',
	'ah-successful-update': 'A qualidade da página foi atualizada.',
	'ah-report': 'Estatísticas:<ul>' +
		'<li>$1 $2 caracteres de código wiki</li>' +
		'<li>$3 $4 ligações internas</li>' +
		'<li>$5 $6 seções</li>' +
		'<li>$7 $8 parágrafos</li>' +
		'<li>$9 $10 referências</li>' +
		'<li>$11 $12 imagens</li>' +
		'</ul>'
});

function updateQuality( page, quality ){
	var processWikiText = function ( text ){
		// Exemplo: {marca de projeto|?|Matemática|?|WP Offline|?|bot=3/20110904|rev=20110904}
		var	reMarca = /\{\{[Mm]arca de projeto\|\s*(\?|0?\d)([^\n\}]*?)\s*(\|\s*rev\s*=\s*\d{6}\s*)?\}\}/,
			newWikiText;
		if ( !text ){
			newWikiText = '{' + '{marca de projeto|' + quality + '}}';
		} else {
			newWikiText = text.replace( reMarca, function( match, oldQuality, projectInfo, rev ){
				return '{' + '{marca de projeto|' + quality + projectInfo + '|{' + '{subst:rev}}}}';
			});
		}
		console.debug( text, newWikiText );
		editPage( page, newWikiText, mw.msg( 'ah-quality-update-summary', quality ) );
	};

	$.ajax({
		url: mw.util.wikiScript( 'api' ),
		dataType: 'json',
		data: {
			'format': 'json',
			'action': 'query',
			'titles': page,
			'prop': 'revisions',
			'rvprop': 'content',
			'indexpageids': '1'
		},
		success: function( data ) {
			if ( 'error' in data ) {
				alert( 'Erro da API: ' + data.error.code + '. ' + data.error.info );
			} else if ( data.query && data.query.pages && data.query.pageids ) {
				if( data.query.pages[ data.query.pageids[0] ].missing === '' ) {
					processWikiText( '' );
				} else {
					processWikiText( data.query.pages[ data.query.pageids[0] ].revisions[0]['*'] );
				}
			} else {
				alert( 'Houve um erro inesperado ao usar a API do MediaWiki.' );
			}
		},
		error: function() {
			alert( 'Houve um erro ao usar AJAX para consultar o conteúdo da página.' );
		}
	});
}
function editPage( page, text, summary ){
	// Edit page (must be done through POST)
	$.ajax({
		url: mw.util.wikiScript( 'api' ),
		type: 'POST',
		dataType: 'json',
		data: {
			format: 'json',
			action: 'edit',
			title: page,
			text: text,
			summary: summary,
			token: mw.user.tokens.get( 'editToken' )
		},
		success: function( data ) {
			if ( data && data.edit && data.edit.result && data.edit.result === 'Success' ) {
				jsMsg( mw.msg( 'ah-successful-update' ) );
			} else {
				alert( 'Houve um erro ao requisitar a edição da página.' );
			}
		},
		error: function() {
			alert( 'Houve um erro ao usar AJAX para editar a página.' );
		}
	});
}

function estimateQuality( text ){
	var	maxQuality = 4,
		quality = 0,
		// For each key, stores a list of qualities which meet the criteria indicated by that key
		meetReq = {},
		possiblyLevels = {},
		mParagraphs = text.match( /(?:^|\n\n|==\n)[^*\n].{100,}?(?=\n\n|\n==|$)/g ), // Only paragraphs of 100+ characters
		//FIXME: This doesn't matches titles containing ":". Maybe create a list of interwikis (from [[Special:SiteMatrix]])?
		mLinks = text.match( /\[\[[^:]*?\]\]/g ),
		mSections = text.match( /(?:^|\n)==\s*[^\n\}\{]+?\s*==[\s\S]+?(?=\n==[^=\n]|$)/g ),
		// Minimum requirements
		pageInfo = {
			'size': text.length,
			'links': (mLinks && mLinks.length) || 0,
			'sections': (mSections && mSections.length) || 0,
			'paragraphs': (mParagraphs && mParagraphs.length) || 0,
			// FIXME: This should detect all reference templates
			// See [[:Categoria:!Predefinições para referências]]
			'references': text.split( /<ref[^\n\/]*?>[\s\S]*?<\/ref>|<ref\s*[\s\S]+?\/>|\{\{(?:[Cc]it(?:ar?|e)|[Rr]ef)/ ).length - 1,
			'images': text.split( /\[\[(?:Imagem?|File|Ficheiro|Arquivo)/ ).length - 1
		},
		reportText;
	var hasRefs = function ( text ){
		// FIXME: This should detect all reference templates
		// See [[:Categoria:!Predefinições para referências]]
		return (/<ref|\{\{(?:[Cc]it(?:ar?|e)|[Rr]ef)/).test( text );
	};
	var exceedMaxParagraphLength = function ( text, max ){
		if( !mParagraphs ){
			return false;
		}
		for ( var i=0; i< mParagraphs.length; i++){
			if ( mParagraphs[i].length > max ) {
				return true;
			}
		}
		// Bad wikification
		return false;
	};
	var hasSomeTemplateFromList = function ( text, list ){
		$.each( list, function( i, templateName ){
			var first = $.escapeRE( templateName.charAt(0) ),
				uFirst = first.toUpperCase(),
				lFirst = first.toLowerCase();
			if ( first.length === 1 && uFirst !== lFirst ) {
				first = '[' + uFirst + lFirst + ']';
			}
			list[i] = first + $.escapeRE( templateName.substr(1) );
		});
		var reTemplates = new RegExp( '\\{\\{' + list.join( '|' ) );
		return reTemplates.test( text );
	};
	var hasEveryTemplateFromList = function ( text, list ){
		for ( var i = list.length - 1; i >= 0; i--){
			if ( text.indexOf( '{' + '{' + list[i] ) === -1 ) {
				return false;
			}
		}
		return true;
	};
	/**
	* See also:
	* [[Wikipédia:Avaliação automática]]
	* [[User:Danilo.bot/marcas.py]]
	*/
	var requirements = {
		'size': {
			'2': function( text ){
				return hasRefs( text )? 2000 : 8000;
			},
			'3': 12000,
			'4': 20000
		},
		'links': {
			'2': 10,
			'3': 30,
			'4': 50
		},
		'sections': {
			'3': 3,
			'4': 5
		},
		'paragraphs': {
			'2': 5,
			'3': 5, // This is not required on [[Wikipédia:Avaliação automática]], but is for consistency
			'4': 5 // Idem
		},
		'references': {
			'3': 5,
			'4': 10
		},
		'images': {
			'3': 1,
			'4': 2
		},
		'paragraph-length': {
			'2': 2500,
			'3': 2500,
			'4': 2500
		},
		'template-black-list': {
			'2': [ 'contexto', 'reciclagem', 'reciclar-sobre' ],
			'3': [ 'contexto', 'reciclagem', 'reciclar-sobre', 'esboço',
					'wikificação', 'revisão' ],
			'4': [
				// FIXME: Get these lists from API
				// [[:Categoria:!Avisos para artigos com problemas]]
				'Mtag', 'Mtag/doc', 'Multitag', 'Artigo com problemas',
				'Artigo longo', 'Artigo sobre direito com problemas', 'Disputa-bpv',
				'BSRE', 'Caracteres não-padrão', 'Sem cat', 'Contextualizar',
				'Contextualizar2', 'Conteúdo parcial', 'Controverso', 'Corrigir',
				'Ctx', 'Ctx2', 'Direitos-autorais', 'Divisão', 'Em tradução',
				'Expandir', 'Expandir2', 'S-fontes-bpv', 'Sem-fontes-bpv', 'Fusão',
				'Fusão com', 'Fusão vot', 'Fusão de', 'Global', 'Global/Brasil',
				'Global/Lusofonia', 'Global/Portugal', 'Hanzi', 'Idioma estrangeiro',
				'Semimagem-arquitetura', 'Semimagem-sobre', 'Conflito interwiki',
				'Matrad', 'Matrad/Código', 'Má introdução', 'Má tradução',
				'Não enciclopédico', 'Não informado', 'Não informado n', 'Não-enc',
				'Não-enciclopédico2', 'Parcial', 'Parcialcontroverso',
				'Wikipédia:Projetos/Páginas novas', 'Publicidade', 'Rec',
				'Reciclagem', 'Reciclar-sobre', 'Ren-pag', 'Renomear página',
				'Revisão-sobre', 'Revisão', 'Revisão de tradução', 'Sem-fontes-sobre',
				'Separar', 'Suspeito', 'Suspeito2', 'Tradução de', 'Curiosidades',
				'VDA', 'VDA2', 'Wikificação', 'Wkf',
				// [[:Categoria:!Predefinições sobre fontes em falta]]
				'Encontre fontes', 'Fonte primária religiosa', 'Carece de fontes',
				'Carece de fontes/bloco', 'Carece de fontes2', 'Fontes primárias',
				'Fpr', 'M-notas', 'Mais notas', 'Pesquisa inédita', 'S-fontes',
				'S-fontes-bpv', 'S-notas', 'Sem-fontes-sobre', 'Sem notas',
				'Sem-fontes', 'Sem-fontes-bpv',
				// [[:Categoria:!Predefinições sobre falta de formatação de referências]]
				'F-referências', 'Formatar referências'
			]
		}
	};
	for(var i=1; i<=maxQuality; i++){
		possiblyLevels[i] = true;
	}
	$.each( requirements, function( req, qList ){
		meetReq[ req ] = [];
		$.each( possiblyLevels, function( level ){
			var ok, value = qList[ level ];
			level = parseInt(level, 10);
			if ( !value ) {
				// This is not a requirement for this level of quality, just go to next level
				meetReq[ req ].push( level );
				return true;
			}
			if ( $.isFunction( value ) ) {
				value = value( text );
				requirements[req][level] = value;
			}
			switch ( req ) {
			case 'size':
			case 'links':
			case 'sections':
			case 'paragraphs':
			case 'references':
			case 'images':
				ok = pageInfo[ req ] >= value;
				break;
			case 'paragraph-length':
				ok = !exceedMaxParagraphLength( text, value );
				break;
			case 'template-black-list':
				ok = !hasSomeTemplateFromList( text, value );
				break;
			case 'template-list':
				ok = hasEveryTemplateFromList( text, value );
				break;
			}
			if ( ok ) {
				meetReq[ req ].push( level );
			}
		});
		// Now, meetReq has a list of the levels which meet teh current requirement
		// If a given level doesn't meet the current requirement, the page can't be of that level
		$.each( possiblyLevels, function( level ){
			level = parseInt(level, 10);
			if ( possiblyLevels[ level ] && $.inArray( level, meetReq[ req ] ) === -1 ){
				possiblyLevels[ level ] = false;
			}
		});
	});
console.debug( 'meetReq=', meetReq );
	for (var q = maxQuality; q>0; q--){
		if ( quality > 0 ){
			// At this point, quality > q
			if ( !possiblyLevels[q] ) {
				// Inconsistency detected!
				break;
			}
		} else if ( possiblyLevels[q] ){
			/* The page level is the greater possibly level,
			* i.e. the one for which all requirements are met
			* FIXME: "bom artigo" shouldn't be required for quality 6
			*/
			quality = q;
		}
	}
	if ( q === 0 ) {
		reportText = mw.msg(
			'ah-inform-level',
			quality,
			mw.util.wikiGetlink( 'Wikipédia:Avaliação automática' )
		);
	} else {
		reportText = mw.msg(
			'ah-inform-inconsistency',
			quality,
			mw.util.wikiGetlink( 'Wikipédia:Avaliação automática' ),
			q
		);
	}
	if ( quality < maxQuality ){
		// The levels above maxQuality should be evaluated by humans
		if ( hasSomeTemplateFromList( text, [ 'artigo bom' ] ) ){
			reportText += '\n' + mw.msg(
				'ah-inform-good-article-inconsistency',
				mw.util.wikiGetlink( 'Wikipédia:Avaliação automática' ),
				quality
			);
		} else if ( hasSomeTemplateFromList( text, [ 'artigo destacado'  ] ) ){
			reportText += '\n' + mw.msg(
				'ah-inform-featured-article-inconsistency',
				mw.util.wikiGetlink( 'Wikipédia:Avaliação automática' ),
				quality
			);
		}
	}
	var reportInfo = {};
	var css = '';
	$.each(
		[ 'size', 'links', 'sections', 'paragraphs', 'references', 'images' ],
		function( i, data ){
			var	max = 1.4 * ( requirements[ data ][ maxQuality ] || 0 ),
				p;
			if( max < pageInfo[ data ] ){
				max = pageInfo[ data ];
			}
			reportInfo[ data ] = pageInfo[ data ];
			if ( requirements[ data ][ quality ] ){
				reportInfo[ data ] += ' > ' + requirements[ data ][ quality ];
			}
			// Generate CSS for progress bar
			for( i=1; i < maxQuality; i++ ){
				var	diff = ( requirements[ data ][ i+1 ] || 0) - ( requirements[ data ][ i ] || 0),
					pi = 100 * ( diff / max).toFixed(2);
				css += '#ah-' + data + ' .ah-q' + i + '{ width: ' + pi + '%; } ';
			}
			p = 100 * (( pageInfo[ data ] || 0 )/ max).toFixed(2);
			css += '#ah-' + data + ' .ah-percent { left: ' + p.toFixed(2) + '%; } ';
		}
	);
	mw.util.addCSS( css );
	var progressBar =
		'<span class="ah-percent">&nbsp;</span>' +
		'<span class="ah-q1"></span>' +
		'<span class="ah-q2"></span>' +
		'<span class="ah-q3"></span>' +
		'</div>';
	reportText += '\n' + mw.msg(
		'ah-report',
		'<div id="ah-size">' + progressBar, reportInfo.size,
		'<div id="ah-links">' + progressBar, reportInfo.links,
		'<div id="ah-sections">' + progressBar, reportInfo.sections,
		'<div id="ah-paragraphs">' + progressBar, reportInfo.paragraphs,
		'<div id="ah-references">' + progressBar, reportInfo.references,
		'<div id="ah-images">' + progressBar, reportInfo.images
	);
	var	ns = mw.config.get( 'wgNamespaceNumber' ),
		talkPage = mw.config.get( 'wgFormattedNamespaces' )[ ns - ns%2 + 1 ] +
			':' + mw.config.get( 'wgTitle' );
	reportText += mw.html.element(
		'a', {
			id: 'ah-update-link',
			href: mw.util.wikiGetlink( talkPage ),
			title: mw.msg( 'ah-ask-for-update-title', quality )
		}, mw.msg( 'ah-ask-for-update-text', quality )
	) + '.';
	$( '#ah-update-link' ).live( 'click', function( e ){
		e.preventDefault();
		updateQuality( talkPage, quality );
	});
	jsMsg( reportText );
	return quality;
}

function runPriorityChecker(){
	var	enPageName = $('#p-lang').find('.interwiki-en a').attr('href'),
		enTalkPage = 'Talk:' + decodeURIComponent( (enPageName || '').replace(/^.+\/wiki\//g, '') );
	//'https://en.wikipedia.org/w/api.php?format=json&action=query&prop=categories&titles=Talk:' + enTalkPage
	// [[Predefinição:Escala de importância]]
	$.ajax({
		url: '//en.wikipedia.org/w/api.php',
		dataType: 'jsonp',
		data: {
			'format': 'json',
			'action': 'query',
			'prop': 'categories',
			'cllimit': 20,
			'titles': enTalkPage,
			'indexpageids': '1'
		},
		success: function( data ){
			var	cats,
				found = false,
				legend = {
					Top: 4,
					High: 3,
					Mid: 2,
					Low: 1
				};
			try {
				cats = data.query.pages[ data.query.pageids[0] ].categories;
			} catch (err) {
				jsMsg('Não foi possível possível determinar a prioridade do artigo na Wikipédia inglesa.', err);
				return false;
			}
			if ( !cats ) {
				jsMsg('Ainda não foi informada a prioridade da versão inglesa deste artigo.');
				return false;
			}
			$.each(cats, function(id, value){
				var priority = value.title.match( /Category:(Top|High|Mid|Low)-Priority/ );
				if ( priority && priority[1] ) {
					found = true;
					jsMsg(
						'Este artigo corresponde a um de prioridade "' +
						priority[1] +
						'" na Wikipédia inglesa. Considere indicar na discussão que ele é de importância ' +
						legend[ priority[1] ] + '.'
					);
					return false;
				}
			});
			if ( !found ) {
				jsMsg('Não foi possível possível determinar a prioridade do artigo na Wikipédia inglesa.');
				return false;
			}
		}
	});
}


/* Matrix Updater */
var	wikiproject,
	cats = {
		'quality' : [
			'!Artigos de qualidade 1 sobre $1',
			'!Artigos de qualidade 2 sobre $1',
			'!Artigos de qualidade 3 sobre $1',
			'!Artigos de qualidade 4 sobre $1',
			'!Artigos bons sobre $1',
			'!Artigos destacados sobre $1',
			'!Artigos de qualidade desconhecida sobre $1'
		],
		'importance' : [
			'!Artigos de importância 4 sobre $1',
			'!Artigos de importância 3 sobre $1',
			'!Artigos de importância 2 sobre $1',
			'!Artigos de importância 1 sobre $1',
			'!Artigos de importância desconhecida sobre $1'
		]
	},
	types = [ 'quality', 'importance' ],
	pages, matrix, curC, curType, nRequests, done;
function getTableWikiCode( t ){
	var	table = [],
		line;
	for( var j = 0; j < t[0].length; j++ ){
		line = [];
		for( var i = 0; i < t.length; i++ ){
			line.push( t[i][j] );
		}
		table.push( line.join( ' | ' ) );
	}
	return [
		'<!-- ### inicio ### -->{{Matriz de classificação',
		'| ' + table.join( '\n| ' ),
		'|sobre=' + wikiproject,
		'|projeto=Portal:' + wikiproject.charAt(0).toUpperCase() + wikiproject.slice(1),
		'}}',
		'<small>\'\'\'última atualização\'\'\': ~' + '~~' + '~~</small>',
		'',
		'<!-- ### fim ### -->'
	].join( '\n' );
}
function countIntersection( list1, list2 ){
	var total = 0;
	for( var i = 0; i < list1.length; i++ ){
		for( var j = 0; j < list2.length; j++ ){
			if( list1[i].pageid === list2[j].pageid ){
				total++;
				break;
			}
		}
	}
	return total;
}
function intersectCats( t1, t2 ){
	// For each pair of categories, find the number of pages in the intersection
	$.each( cats[ t1 ], function(i, c1){
		matrix[i] = [];
		$.each( cats[ t2 ], function(j, c2){
			matrix[i][j] = countIntersection( pages[t1][i], pages[t2][j] );
		});
	});
}
function processCurrentCat( from ){
	var data = {
		'format': 'json',
		'action': 'query',
		'list': 'categorymembers',
		'cmlimit': '500',
		'cmtitle': 'Category:' + cats[ types[ curType ] ][ curC ].replace( /\$1/g, wikiproject ),
		'cmprop': 'ids'
	};
	if ( from ){
		data.cmcontinue = from;
	}
	$.ajax({
		url: mw.util.wikiScript( 'api' ),
		dataType: 'json',
		data: data,
		success: function( data ) {
			if ( !data ) {
				alert( 'Erro: A API não retornou dados.' );
			} else if ( 'error' in data ) {
				alert( 'Erro da API: ' + data.error.code + '. ' + data.error.info );
			} else if ( data.query && data.query.categorymembers ) {
				// Add to list
				$.merge( pages[ types[ curType ] ][ curC ], data.query.categorymembers );
				if( data[ 'query-continue' ] ){
					processCurrentCat(
						data[ 'query-continue' ].categorymembers &&
						data[ 'query-continue' ].categorymembers.cmcontinue
					);
				} else {
					done++;
					jsMsg( 'Concluída a análise de ' + done + ' das ' + nRequests + ' categorias (' + (100 * done / nRequests).toFixed(1) + '%)' );
					curC++;
					if( curC < cats[ types[ curType ] ].length ){
						processCurrentCat();
					} else {
						curType++;
						if( curType < types.length ){
							curC = 0;
							processCurrentCat();
						} else {
							// Now, intersect cats to get the numbers
							intersectCats( 'quality', 'importance' );
							// and print the wikicode
							jsMsg( 'Código wiki:<br><pre>' + mw.html.escape( getTableWikiCode( matrix ) ) + '</pre>' );
						}
					}
				}
			} else {
				alert( 'Houve um erro ao consultar os membros da categoria.' );
			}
		},
		error: function() {
			alert( 'Houve um erro ao usar AJAX para consultar os membros da categoria.' );
		}
	});
}


if ( 0 === mw.config.get( 'wgNamespaceNumber' ) &&  mw.config.get( 'wgAction' ) === 'view' ) {
	$(function(){
		var getText = function ( query ){
			var	pages = query.query.pages,
				pageids = query.query.pageids,
				i, text;

			for (i = 0; i < pageids.length; i++) {
				if (!pages[ pageids[i] ].pageid) {
					continue;
				}
				text = pages[ pageids[i] ].revisions[0]['*'];
				break;
			}
			estimateQuality( text );
		};
		var runQualityChecker = function ( page ) {
			$.getJSON(
				mw.util.wikiScript( 'api' ), {
					'format': 'json',
					'action': 'query',
					'titles': page,
					'prop': 'revisions',
					'rvprop': 'content',
					'indexpageids': '1'
				}, getText
			);
		};
		if ( mw.config.get( 'qcAutoCheck' ) ){
			runQualityChecker( mw.config.get( 'wgPageName' ) );
		}
		var	pQuality = mw.util.addPortletLink(
				'p-cactions',
				'#',
				mw.msg( 'ah-check-quality-link' ),
				'ca-ah-quality',
				mw.msg( 'ah-check-quality-desc' )
			),
			pPriority = mw.util.addPortletLink(
				'p-cactions',
				'#',
				mw.msg( 'ah-check-priority-link' ),
				'ca-ah-priority',
				mw.msg( 'ah-check-priority-desc' )
			);
		// Bind click handler
		$(pQuality).click( function( e ) {
			e.preventDefault();
			runQualityChecker( mw.config.get( 'wgPageName' ) );
		});
		$(pPriority).click( function( e ) {
			e.preventDefault();
			runPriorityChecker( );
		});
	});
}
$(function(){
	var pMatrix = mw.util.addPortletLink(
		'p-cactions',
		'#',
		mw.msg( 'ah-matrix-updater-link' ),
		'ca-ah-matrix-updater',
		mw.msg( 'ah-matrix-updater-desc' )
	);
	$(pMatrix).click( function( e ) {
		e.preventDefault();
		pages = {};
		matrix = [];
		curC = 0;
		curType = 0;
		nRequests = 0;
		done=0;
		wikiproject = prompt( 'Informe o nome do wikiprojeto:', 'matemática' );
		if( !wikiproject ) {
			return;
		}
		// wikiproject = wikiproject.charAt(0).toLowerCase() + wikiproject.slice(1);
		$.each( types, function(i, t){
			pages[t] = [];
			$.each( cats[t], function(j, c){
				nRequests++;
				pages[t][j] = [];
			});
		});
		processCurrentCat();
	});
});



/* Script que gera uma tabela de afluentes para uma determinada categoria */
var    pageList = [],
	category;
function getWikitableForData( data, title, format ){
	var	text = '{| class="wikitable sortable"\n',
		cols = data[0].length, i, j;
	if ( title ){
		text += '|+ ' + title + '\n';
	}
	if ( !format ){
		format = [];
		for( j= 0; j< data.length; j++){
			format[j] = '$' + (j+1);
		}
	}
	format = '|-\n|' + format.join( '||' ) + '\n';
	text += '|-\n!' + data[0].join( '||' ) + '\n';
	for( i= 1; i< data.length; i++){
		line = format;
		for( j= 0; j< data.length; j++){
			line = line.replace( new RegExp( '\\$' + (j+1), 'g'), data[i][j] );
		}
		text += line;
	}
	text += '|}';
	return text;
}
function generateBackLinksTable(){
	total = pageList.length;
	done = 0;
	mean = 0;
	table = [ [ 'Páginas', 'Afluentes' ] ];
	$.each( pageList, function(pos, page){
		$.getJSON(
			mw.util.wikiScript( 'api' ), {
				'format': 'json',
				'action': 'query',
				'list': 'backlinks',
				'bltitle': page,
				'blnamespace': '0|102',
				'blfilterredir': 'nonredirects',
				'blredirect': true,
				'bllimit': 500,
				'indexpageids': true
			}, function( data ){
				table.push( [ page, data.query.backlinks.length ] );
				done++;
				mean = mean + ( data.query.backlinks.length - mean)/done;
				jsMsg( 'Processando a página ' + done + ' de um total de ' + total + '.' );
				if ( done === total ){
					text = 'Os artigos da [[:' + category + ']] têm em média ' + Math.round(mean) + ' afluentes.\n\n';
					text += getWikitableForData(
						table,
						'Número de afluentes das páginas de [[:' + category + '|' + category + ']]',
						[ '[[:$1]]', '[[Special:Páginas afluentes/$1|$2]]' ]
					);
					jsMsg(
						'<b>Código wiki:</b><br/><br/>' +
						'<textarea cols="80" rows="40" style="width: 100%; font-family: monospace; line-height: 1.5em;">' +
						mw.html.escape(text) +
						'</textarea>'
					);
				}
			}
		);
	});
}
function processCategory( cat, from ){
	var data = {
		'format': 'json',
		'action': 'query',
		'generator': 'categorymembers',
		'gcmtitle': cat,
		'gcmlimit': '500',
		'indexpageids': '1'
	};
	if ( from ){
		data.gcmcontinue = from;
	}
	$.ajax({
		url: mw.util.wikiScript( 'api' ),
		dataType: 'json',
		data: data,
		success: function( data ) {
			var cont;
			var list = [];
			if ( !data ) {
				alert( 'Erro: a API não retornou dados.' );
			} else if ( 'error' in data ) {
				alert( 'Erro da API: ' + data.error.code + '. ' + data.error.info );
			} else if ( data.query && data.query.pageids && data.query.pages) {
				$.each( data.query.pageids, function(pos, id){
					pageList.push( data.query.pages[id].title.replace( /^(?:Anexo )?Discussão:/g, '' ) );
				});
				cont = data[ 'query-continue' ] &&
					data[ 'query-continue' ].categorymembers &&
					data[ 'query-continue' ].categorymembers.gcmcontinue;
				if( cont ){
					processCategory( cat, cont );
				} else {
					jsMsg( 'Concluída a consulta à ' + cat + '.' );
					generateBackLinksTable();
				}
			} else {
				alert( 'Houve um erro inesperado ao consultar os membros da categoria.' );
			}
		},
		error: function() {
			alert( 'Houve um erro ao usar AJAX para consultar os membros da categoria.' );
		}
	});
}

$(function(){
	$(mw.util.addPortletLink(
		'p-cactions',
		'#',
		'Gerar tabela de afluentes',
		'ca-ah-backlinks',
		'Produz uma tabela com o número de afluentes por artigo da categoria especificada'
	)).click( function( e ) {
		e.preventDefault();
		category = prompt(
			'Informe o nome de uma categoria (usada nos artigos ou nas páginas de discussão):',
			mw.config.get('wgNamespaceNumber') === 14?
				mw.config.get('wgPageName').replace( /_/g, ' ' ) :
				'Categoria:!Artigos de qualidade 2 sobre matemática'
		);
		if( !category ) {
			return;
		}
		processCategory( category );
	});
});

})();




/* Script para plotar gráficos relacionando o número de afluentes e o tamanho dos artigos de certa categoria */
// FIXME: Fundir as funções que consultam a API com as usadas mais acima...

(function() {

function plotTableUsingGoogleAPI( table, cat ){
	var drawChart = function () {
		var	data = new google.visualization.DataTable(),
			list = [], links, size;

		data.addColumn('number', 'Afluentes');
		data.addColumn('number', 'Detalhes:');

		$.each( table, function( page, info ){
			links = info.links;
			size = info.size;
			list.push( [
				{
					v: links,
					f: page + ', com ' + links + ' afluentes'
				}, {
					v: size,
					f: size + ' bytes'
				}
			] );
		});
		data.addRows( list );
		// http://code.google.com/apis/chart/interactive/docs/gallery/scatterchart.html#Configuration_Options
		var options = {
			//width: 800,
			height: 300,
			pointSize: 1,
			title: 'Comparação do número de afluentes com o tamanho (em bytes) dos artigos da ' + cat,
			hAxis: {title: 'Afluentes'},// minValue: 0, maxValue: 400},
			vAxis: {title: 'Tamanho'},// minValue: 0, maxValue: 2000},
			legend: 'none'
		};

		var chart = new google.visualization.ScatterChart(document.getElementById('mw-js-message'));
		chart.draw(data, options);
	};

	$.getScript('https://www.google.com/jsapi', function(data, textStatus){
		if('success' !== textStatus){
			alert('Não foi possível carregar a API do Google'); return;
		}
		google.load("visualization", "1", {
			packages:["corechart"],
			callback: drawChart
		});
	});
}
function getLength( obj ){
	var total;
	if ( $.isArray( obj ) ){
		return obj.length;
	} else {
		total = 0;
		$.each( obj, function(pos, page){
			total++;
		});
		return total;
	}
}

function addArticleSizeToTable( list, callback ){
	var	isList = $.isArray( list ),
		total = getLength( list ),
		table = isList? {} : list,
		done = 0,
		num = 0,
		titles;
	var processSomePages = function( data ){
		$.each( data.query.pages, function( pos, page ){
			if( typeof table[ page.title ] === 'undefined' || isList ) {
				table[ page.title ] = {};
			}
			table[ page.title ].size = page.revisions[0].size;
			done++;
			jsMsg( 'Foi processado o tamanho da página ' + done + ' de um total de ' + total + '.' );
			if ( done === total ){
				if( $.isFunction( callback ) ){
					callback( table );
				}
			}
		});
	};

	$.each( list, function( pos, page ){
		var	title = isList? page: pos,
			maxTitles = 50;
		if ( num % maxTitles !== 0){
			titles += '|' + title;
		} else if ( num === 0) {
			titles = title;
		}
		if( ( (num % maxTitles === 0) && (num > 0) ) || num === total-1 ) {
			$.getJSON(
				mw.util.wikiScript( 'api' ), {
					'format': 'json',
					'action': 'query',
					'prop': 'revisions',
					'titles': titles,
					'rvprop': 'size',
					'indexpageids': true
				}, processSomePages
			);
			titles = title;
		}
		num++;
	});
}

function getTotalOfBackLinks( title, callback, limit, from, links ){
	var	data = {
			'format': 'json',
			'action': 'query',
			'list': 'backlinks',
			'bltitle': title,
			'blnamespace': '0|102',
			'blfilterredir': 'nonredirects',
			'blredirect': true,
			'bllimit': limit < 500? limit: 500,
			'indexpageids': true
		};
	links = links || 0;
	if ( from ){
		data.blcontinue = from;
	}
	$.ajax({
		url: mw.util.wikiScript( 'api' ),
		dataType: 'json',
		data: data,
		success: function( data ) {
			var cont;
			if ( !data ) {
				alert( 'Erro: a API não retornou dados.' );
			} else if ( 'error' in data ) {
				alert( 'Erro da API: ' + data.error.code + '. ' + data.error.info );
			} else if ( data.query && data.query.backlinks ) {
				cont = data[ 'query-continue' ] &&
					data[ 'query-continue' ].backlinks &&
					data[ 'query-continue' ].backlinks.blcontinue;
				links += data.query.backlinks.length;
				if( cont && links < limit ){
					getTotalOfBackLinks( title, callback, limit, cont, links );
				} else {
					jsMsg( 'Concluída a contagem de afluentes de ' + title + '.' );
					if( $.isFunction( callback ) ){
						callback( links );
					}
				}
			} else {
				alert( 'Houve um erro inesperado ao consultar os afluentes da página ' + title + '.' );
			}
		},
		error: function() {
			alert( 'Houve um erro ao usar AJAX para consultar os afluentes da página ' + title + '.' );
		}
	});

	
}

function addNumberOfBackLinksToTable( list, callback, from ){
	var	isList = $.isArray( list ),
		total = getLength( list ),
		table = isList? {} : list,
		done = 0;
	$.each( list, function(pos, page){
		var title = isList? page: pos;
		getTotalOfBackLinks(
			title,
			function( links ){
				done++;
				jsMsg( 'Foram processados os afluentes da página ' + done + ' de um total de ' + total + '.' );
				if( isList || typeof table[ page ] === 'undefined' ) {
					table[ page ] = {};
				}
				table[ page ].links = links;
				if ( done === total ){
					if( $.isFunction( callback ) ){
						callback( table );
					}
				}
			},
			1500 // If the number of backlinks is greater than this, do not use new API calls to find the exact value
		);
	});
}
function getPagesFromCat( cat, callback, from, list ){
	var data = {
		'format': 'json',
		'action': 'query',
		'generator': 'categorymembers',
		'gcmnamespace': '0|1|102|103',
		'gcmtitle': cat,
		'gcmlimit': '500',
		'indexpageids': '1'
	};
	if ( from ){
		data.gcmcontinue = from;
	}
	list = list || [];
	$.ajax({
		url: mw.util.wikiScript( 'api' ),
		dataType: 'json',
		data: data,
		success: function( data ) {
			var cont;
			if ( !data ) {
				alert( 'Erro: a API não retornou dados.' );
			} else if ( 'error' in data ) {
				alert( 'Erro da API: ' + data.error.code + '. ' + data.error.info );
			} else if ( data.query && data.query.pageids && data.query.pages) {
				$.each( data.query.pageids, function(pos, id){
					list.push( data.query.pages[id].title.replace( /^(?:Anexo )?Discussão:/g, '' ) );
				});
				cont = data[ 'query-continue' ] &&
					data[ 'query-continue' ].categorymembers &&
					data[ 'query-continue' ].categorymembers.gcmcontinue;
				if( cont ){
					getPagesFromCat( cat, callback, cont, list );
				} else {
					jsMsg( 'Concluída a consulta à ' + cat + '.' );
					if( $.isFunction( callback ) ){
						callback( list );
					}
				}
			} else if ( data.length === 0 ){
				alert( 'A ' + cat + ' está vazia.' );
			} else {
				alert( 'Houve um erro inesperado ao consultar a categoria.' );
			}
		},
		error: function() {
			alert( 'Houve um erro ao usar AJAX para consultar os membros da categoria.' );
		}
	});
}

$(function(){
	$(mw.util.addPortletLink(
		'p-cactions',
		'#',
		'Gerar gráfico de Tamanho x Afluentes',
		'ca-ah-size-vs-links',
		'Produz um gráfico que relaciona o número de afluentes e o tamanho dos artigos de um categoria'
	)).click( function( e ) {
		var reCat = /^Categor(ia|y):/; //FIXME: Use wgNamespaceIds for other wikis
		e.preventDefault();
		category = prompt(
			'Informe o nome de uma categoria (usada nos artigos ou nas páginas de discussão):',
			mw.config.get('wgNamespaceNumber') === 14?
				mw.config.get('wgPageName').replace( /_/g, ' ' ) :
				'Categoria:!Artigos de qualidade 3 sobre matemática'
		);
		if( !category ) {
			return;
		}
		category = category.replace( /_/g, ' ' );
		if( ! reCat.test( category ) ){
			category = 'Categoria:' + category;
		}
		getPagesFromCat(category, function( list ){
			addNumberOfBackLinksToTable( list, function( table ){
				addArticleSizeToTable( table, function( table ){
					jsMsg('Pronto!');
					plotTableUsingGoogleAPI(table, category);
				} );
			});
		});
	});
});

})();
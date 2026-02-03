/*\
title: $:/plugins/jerojasro/caltex/widgets/CalTex
type: application/javascript
module-type: widget

Widget for evaluating math expressions and rendering them as text or LaTeX via KaTeX

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var math = require("$:/plugins/jerojasro/caltex/libraries/math.js");

math.import({linreg: function(Y, X) {
    var sumx = math.sum(X);
    var sumy = math.sum(Y);
    var sumxy = math.sum(math.dotMultiply(X, Y));
    var sumx2 = math.sum(math.dotMultiply(X, X));
    var n = math.count(X);

    var D = math.det([[sumx2, sumx], [sumx, n]]);

    var m = math.det([[sumxy, sumx], [sumy, n]]) / D;
    var b = math.det([[sumx2, sumxy], [sumx, sumy]]) / D;
    return math.matrix([m, b]);
}})

var Widget = require("$:/core/modules/widgets/widget.js").widget;

var CalTexWidget = function(parseTreeNode,options) {
    this.initialise(parseTreeNode,options);
};
CalTexWidget.prototype = new Widget();

CalTexWidget.prototype.renderErrorMessage = function(errorMessage, parent, nextSibling) {
    if (!this.verbose) {
        return;
    }

    var textNode = this.document.createTextNode(errorMessage);
    parent.insertBefore(textNode, nextSibling);
    this.domNodes.push(textNode);
    return;
}

function removeTrailingZeroes(numStr) {
    var i = numStr.length - 1;
    while (i > 0 && numStr[i] == "0") i = i - 1;

    if (numStr[i] == ".") i = i - 1;

    return numStr.substring(0, i + 1);
}

function katexSciNot(n) {
    var s = n.toExponential(3);
    var tokens = s.split("e");
    if (tokens[1][0] == "+") {
        tokens[1] = tokens[1].substring(1);
    }
    return removeTrailingZeroes(tokens[0]) + "\\!\\times\\! 10^{" + tokens[1] + "}";
}

function katexNumber(n) {
    if (n == 0) return "0";

    if (n == Infinity) return "\\infty";

    if (Math.abs(n) >= 1e6 || Math.abs(n) < 1e-4) return katexSciNot(n);

    return removeTrailingZeroes(n.toFixed(6));
}

function katexSymbol(symbolNode) {
    var firstUnderscoreIdx = symbolNode.name.indexOf("_");
    if (firstUnderscoreIdx < 0) {
        return symbolNode.toTex();
    }
    if (firstUnderscoreIdx < 1 || firstUnderscoreIdx >= symbolNode.name.length - 1) {
        return symbolNode.toTex();
    }

    var sym = symbolNode.name.slice(0, firstUnderscoreIdx);
    var subIndex = symbolNode.name.slice(firstUnderscoreIdx + 1, symbolNode.name.length);

    return (new math.SymbolNode(sym).toTex()) + "_{" + katexSymbol(new math.SymbolNode(subIndex)) + "}";
}

function katexNodeHandler(node, options) {
    if (node.type == 'ConstantNode') {
        return katexNumber(node.value);
    }
    if (node.type == 'SymbolNode') {
        return katexSymbol(node);
    }
    if ((node.type === 'OperatorNode') && (node.fn === 'multiply')) {
      return node.args[0].toTex(options) + ' \\times ' + node.args[1].toTex(options)
    }
}

function katexRow(row) {
    if (typeof row == "number") return katexNumber(row);

    return row.map(katexNumber).join("&");
}

function katexArray(arr) {
    return "\\begin{bmatrix}" + arr.map(katexRow).join("\\\\") + "\\end{bmatrix}"
}

function resultToKatex(result) {
    if (typeof result == "number") {
        return katexNumber(result);
    }

    // TODO this is brittle but I don't see other way of detecting when
    // something is an array
    if (typeof result == "object" && result._data) {
        return katexArray(result._data);
    }
    return result.toString();
}

CalTexWidget.prototype.blockToTex = function(blockNode, resultSet) {
    var nodeTexStrs = [];

    // resultSet does not necessarily have the same amount of elements as in
    // blockNode; if the user finished a statement with a semicolon, the result
    // will be calculated but mathjs won't pass it in the resultSet; this is
    // indicated in each node, in its .visible attribute; the additional index
    // variable for resultSet (rsIdx) handles this
    var rsIdx = 0;

    for (var i = 0; i < blockNode.blocks.length; i++) {
        if (blockNode.blocks[i].visible) {
            nodeTexStrs.push(this.toTex(blockNode.blocks[i].node, resultSet.entries[rsIdx++]));
        }
        else {
            nodeTexStrs.push(this.toTex(blockNode.blocks[i].node, null));
        }
    }
    return nodeTexStrs.join("\\quad");
}


CalTexWidget.prototype.toTex = function(mathNode, result) {
    if (mathNode.type == "BlockNode") {
        return this.blockToTex(mathNode, result);
    }

    // result will be null when the user finished their expression with a
    // semicolon, since the result is calculated but not intended for display
    if (this.isSimpleAssignment(mathNode) || !result) {
        return mathNode.toTex({handler: katexNodeHandler, parenthesis: 'auto'});
    }
    return mathNode.toTex({handler: katexNodeHandler, parenthesis: 'auto'}) + " = " + resultToKatex(result);
}

CalTexWidget.prototype.isSimpleAssignment = function(mathNode) {
    return (
        mathNode.type == "FunctionAssignmentNode" ||
        mathNode.type == "AssignmentNode" &&
        (
            mathNode.value.type == "ConstantNode" ||
            mathNode.value.type == "ArrayNode"
        )
    );
}

CalTexWidget.prototype.mathjsTiddlerScope = function() {
    var tiddlerWidget;
    var self = this;
    while (self) {
        if (self.transcludeTitle && self.transcludeTitle == "$:/core/ui/ViewTemplate/body/default") {
            tiddlerWidget = self;
            break;
        }
        self = self.parentWidget;
    }

    if (! tiddlerWidget.mathjsScope) {
        tiddlerWidget.mathjsScope = {};
    }
    return tiddlerWidget.mathjsScope;
}

/*
Add elements to the DOM
*/
CalTexWidget.prototype.render = function(parent, nextSibling) {
    this.parentDomNode = parent;
    this.computeAttributes();

    this.inline = this.getAttribute("$inline", "yes") == "yes";
    this.verbose = !(this.getAttribute("$verbose", "yes") == "no");

    var expText = getExpressionText(this.parseTreeNode.children);
    if (!expText) return;
    expText = expText.trim();
    if (!expText) return;

    var mathNode;
    var result;
    try {
        mathNode = math.parse(expText);
        result = mathNode.compile().evaluate(this.mathjsTiddlerScope());
    } catch(err) {
        return this.renderErrorMessage("Unable to parse '" + expText + "': " + err, parent, nextSibling);
    }
    return this._render(mathNode, result, parent, nextSibling);
};

/*
Selectively refreshes the widget if needed. Returns true if the widget or any of its children needed re-rendering
*/
CalTexWidget.prototype.refresh = function(changedTiddlers) {
    if (this.refreshChildren(changedTiddlers)) {
        this.refreshSelf();
        return true;
    }
    return false;
};

function getExpressionText(parseTreeNodeChildren) {
    const textWidgets = parseTreeNodeChildren.filter((w) => w.type == "text");

    if ($tw.utils.count(textWidgets) == 0) return "";

    return textWidgets[0].text;
}


CalTexWidget.prototype._render = function(mathNode, result, parent, nextSibling) {
    var katexResult = this.toTex(mathNode, result);

    var displayMode = "true";
    if (this.inline) displayMode = "false";

    var katexParseTreeNode = {
        "tag": "$katex",
        "type": "katex",
        "attributes": {
            "text": {"name": "text", "type": "string", "value": katexResult},
            "displayMode": {"name": "text", "type": "string", "value": displayMode}
        }
    };
    this.makeChildWidgets([katexParseTreeNode]);
    this.renderChildren(parent, nextSibling);

    return;
};

exports.caltex = CalTexWidget;

})();
